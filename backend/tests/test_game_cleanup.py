import asyncio

import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient

import app.main as main


@pytest.fixture
def client(monkeypatch):
    for task in main.turn_tasks.values():
        task.cancel()
    main.turn_tasks.clear()
    main.connections.clear()
    main.games.clear()
    monkeypatch.setattr(main, "schedule_turn", lambda game_id: None)
    with TestClient(main.app) as client:
        yield client


def create_room(client):
    room = client.post("/games", json={"settings": {"lobbyMode": True}}).json()
    game_id = room["gameId"]
    host = client.post(f"/games/{game_id}/join", json={"adminToken": room["adminToken"]}).json()
    client.post(f"/games/{game_id}/bots", json=host)
    return game_id, host


@pytest.mark.parametrize("status", ["waiting", "playing", "finished"])
def test_last_human_departure_deletes_game_and_closes_live_socket(client, status):
    game_id, host = create_room(client)
    if status != "waiting":
        assert client.post(f"/games/{game_id}/start", json=host).status_code == 200
    if status == "finished":
        main.finish_game(main.games[game_id])

    url = f'/games/{game_id}/ws?playerId={host["playerId"]}&token={host["playerToken"]}'
    with client.websocket_connect(url) as socket:
        socket.receive_json()
        response = client.post(f"/games/{game_id}/quit", json=host)
        assert response.status_code == 200
        assert response.json() == {"success": True}
        with pytest.raises(WebSocketDisconnect) as closed:
            socket.receive_json()
        assert closed.value.code == 1001

    assert client.get(f"/games/{game_id}").status_code == 404
    assert game_id not in main.games
    assert game_id not in main.connections
    assert game_id not in main.turn_tasks
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(url) as socket:
            socket.receive_json()


def test_disconnected_human_still_keeps_game_when_other_human_leaves(client):
    game_id, host = create_room(client)
    guest = client.post(f"/games/{game_id}/join", json={}).json()
    assert not next(p for p in main.games[game_id]["players"] if p["id"] == guest["playerId"])["connected"]
    assert client.post(f"/games/{game_id}/start", json=host).status_code == 200
    assert client.post(f"/games/{game_id}/quit", json=host).status_code == 200
    assert client.get(f"/games/{game_id}").status_code == 200
    assert main.games[game_id]["adminPlayerId"] == guest["playerId"]


def test_deletion_cancels_turn_and_tolerates_already_closed_socket(client):
    game_id, host = create_room(client)
    game = main.games[game_id]
    for player in game["players"]:
        player["isBot"] = True

    class ClosedSocket:
        async def close(self, **kwargs):
            raise WebSocketDisconnect(code=1006)

    async def check_cleanup():
        task = asyncio.create_task(asyncio.sleep(60))
        main.turn_tasks[game_id] = task
        main.connections[game_id].add(ClosedSocket())
        assert await main.delete_game_if_no_humans(game)
        with pytest.raises(asyncio.CancelledError):
            await task
        # Late broadcasts and repeated cleanup must not recreate deleted state.
        await main.broadcast_game(game_id)
        assert not await main.delete_game_if_no_humans(game)

    asyncio.run(check_cleanup())
    assert game_id not in main.games
    assert game_id not in main.connections
    assert game_id not in main.turn_tasks
