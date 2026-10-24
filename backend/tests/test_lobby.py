import asyncio
from types import SimpleNamespace

import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient

import app.main as main
from app.game.board_layouts import BOARD_CONFIGS


@pytest.fixture
def client(monkeypatch):
    for task in main.turn_tasks.values():
        task.cancel()
    main.turn_tasks.clear()
    main.games.clear()
    main.connections.clear()
    monkeypatch.setattr(main, "schedule_turn", lambda game_id: None)
    with TestClient(main.app) as test_client:
        yield test_client


def new_lobby(client, player_count=4):
    response = client.post("/games", json={"settings": {
        "lobbyMode": True,
        "boardLayout": "irregular",
        "playerCount": player_count,
        "moveTimeLimitSeconds": 60,
    }})
    assert response.status_code == 200
    room = response.json()
    response = client.post(f'/games/{room["gameId"]}/join', json={"adminToken": room["adminToken"]})
    assert response.status_code == 200
    return room["gameId"], response.json()


def join(client, room_id):
    response = client.post(f"/games/{room_id}/join", json={})
    assert response.status_code == 200
    return response.json()


def state(client, room_id, credentials=None):
    return client.get(f"/games/{room_id}", headers={
        "X-Player-Id": credentials["playerId"],
        "X-Player-Token": credentials["playerToken"],
    } if credentials else {}).json()


def change_settings(client, room_id, credentials, **changes):
    settings = state(client, room_id)["settings"]
    return client.patch(f"/games/{room_id}/settings", json={**settings, **changes, **credentials})


def socket_url(room_id, credentials):
    return f'/games/{room_id}/ws?playerId={credentials["playerId"]}&token={credentials["playerToken"]}'


def test_default_lobby_has_host_editable_profile_and_no_automatic_start(client):
    room_id, host = new_lobby(client)
    initial = state(client, room_id)
    assert initial["lobbyMode"]
    assert initial["settings"]["boardLayout"] == "irregular"
    assert initial["settings"]["playerCount"] == 4
    assert initial["settings"]["moveTimeLimitSeconds"] == 60
    assert initial["adminPlayerId"] == host["playerId"]
    assert initial["players"][0]["name"] == "Player 1"
    for _ in range(3):
        join(client, room_id)
    full = state(client, room_id)
    assert full["status"] == "waiting"
    assert full["turnEndsAt"] is None
    assert full["turnNumber"] == 0
    assert all(player["startPosition"] is None and not player["isBot"] for player in full["players"])
    assert len({player["color"] for player in full["players"]}) == 4


def test_lobby_ignores_bot_configuration(client):
    created = client.post("/games", json={"settings": {
        "lobbyMode": True,
        "players": {f"Player {index}": {"isBot": True} for index in range(1, 5)},
    }}).json()
    assert all(not player["isBot"] for player in created["settings"]["players"].values())


def test_only_host_can_change_settings_and_start(client):
    room_id, host = new_lobby(client, 2)
    guest = join(client, room_id)
    before = state(client, room_id)
    assert change_settings(client, room_id, guest, boardLayout="rooms").status_code == 403
    assert client.post(f"/games/{room_id}/start", json=guest).status_code == 403
    assert client.post(f"/games/{room_id}/start", json={**host, "playerToken": guest["playerToken"]}).status_code == 403
    assert state(client, room_id)["settings"] == before["settings"]
    assert state(client, room_id)["status"] == "waiting"


def test_host_cannot_start_until_full_or_reduce_count_below_roster(client):
    room_id, host = new_lobby(client)
    assert client.post(f"/games/{room_id}/start", json=host).status_code == 409
    join(client, room_id)
    join(client, room_id)
    assert change_settings(client, room_id, host, playerCount=2).status_code == 409
    assert state(client, room_id)["settings"]["playerCount"] == 4
    assert change_settings(client, room_id, host, playerCount=3).status_code == 200
    assert state(client, room_id)["status"] == "waiting"
    assert client.post(f"/games/{room_id}/start", json=host).status_code == 200
    assert client.post(f"/games/{room_id}/start", json=host).status_code == 409
    assert client.post(f"/games/{room_id}/join", json={}).status_code == 409
    assert client.patch(f"/games/{room_id}/profile", json={**host, "name": "Too late"}).status_code == 409
    assert change_settings(client, room_id, host, boardLayout="rooms").status_code == 409


@pytest.mark.parametrize("layout,player_count", sorted(BOARD_CONFIGS))
def test_settings_load_exact_geometry_and_start_assignments(client, layout, player_count):
    room_id, host = new_lobby(client)
    before_assignments = [piece.get("ability") for piece in main.games[room_id]["players"][0]["pieces"]]
    response = change_settings(client, room_id, host, boardLayout=layout, playerCount=player_count, moveTimeLimitSeconds=30)
    assert response.status_code == 200
    assert response.json()["boardConfig"]["id"] == f"{layout}-{player_count}"
    for _ in range(player_count - 1):
        join(client, room_id)
    assert client.post(f"/games/{room_id}/start", json=host).status_code == 200
    snapshot = state(client, room_id)
    config = BOARD_CONFIGS[(layout, player_count)]
    assert len(snapshot["board"]) == config["height"]
    assert len(snapshot["board"][0]) == config["width"]
    assert snapshot["status"] == "playing"
    assert snapshot["turnEndsAt"] is not None
    assert len(snapshot["players"]) == player_count
    positions = {(p["startPosition"]["col"], p["startPosition"]["row"]) for p in snapshot["players"]}
    assert positions == set(config["startPositions"])
    assert [piece.get("ability") for piece in main.games[room_id]["players"][0]["pieces"]] == before_assignments
    assert all(not player["isBot"] for player in snapshot["players"])


def test_profiles_are_owned_and_colours_cannot_be_stolen(client):
    room_id, host = new_lobby(client)
    guest = join(client, room_id)
    response = client.patch(f"/games/{room_id}/profile", json={**host, "name": "  Alice  ", "color": "Blue", "targetPlayerId": guest["playerId"]})
    assert response.status_code == 200
    snapshot = state(client, room_id)
    assert snapshot["players"][0]["name"] == "Alice"
    assert snapshot["players"][1]["name"] == guest["name"]
    assert client.patch(f"/games/{room_id}/profile", json={**guest, "color": "Blue"}).status_code == 409
    assert client.patch(f"/games/{room_id}/profile", json={**host, "playerToken": guest["playerToken"], "name": "Forged"}).status_code == 403
    assert client.patch(f"/games/{room_id}/profile", json={**host, "name": "   "}).status_code == 422
    assert client.patch(f"/games/{room_id}/profile", json={**host, "color": "invalid"}).status_code == 422
    assert client.patch(f"/games/{room_id}/profile", json={**host, "name": "x" * 25}).status_code == 422
    assert client.patch(f"/games/{room_id}/profile", json={**host, "color": "Cyan"}).status_code == 200
    assert client.patch(f"/games/{room_id}/profile", json={**guest, "color": "Blue"}).status_code == 200
    assert len({p["color"] for p in state(client, room_id)["players"]}) == 2


def test_live_profile_settings_and_manual_start_broadcast_to_every_player(client):
    room_id, host = new_lobby(client, 2)
    guest = join(client, room_id)
    with client.websocket_connect(socket_url(room_id, host)) as host_socket:
        host_socket.receive_json()
        with client.websocket_connect(socket_url(room_id, guest)) as guest_socket:
            host_socket.receive_json()
            guest_socket.receive_json()
            assert client.patch(f"/games/{room_id}/profile", json={**guest, "name": "Guest", "color": "Blue"}).status_code == 200
            for socket in [host_socket, guest_socket]:
                snapshot = socket.receive_json()["game"]
                assert snapshot["players"][1]["name"] == "Guest"
                assert snapshot["players"][1]["color"] == "Blue"
            assert change_settings(client, room_id, host, boardLayout="rooms", moveTimeLimitSeconds=None).status_code == 200
            for socket in [host_socket, guest_socket]:
                snapshot = socket.receive_json()["game"]
                assert snapshot["settings"]["boardLayout"] == "rooms"
                assert snapshot["settings"]["moveTimeLimitSeconds"] is None
                assert snapshot["status"] == "waiting"
            assert client.post(f"/games/{room_id}/start", json=host).status_code == 200
            for socket, owner in [(host_socket, host), (guest_socket, guest)]:
                snapshot = socket.receive_json()["game"]
                assert snapshot["status"] == "playing"
                assert snapshot["turnNumber"] == 1
                assert snapshot["turnEndsAt"] is None
                for player in snapshot["players"]:
                    abilities = [p.get("ability") for p in player["pieces"] if p.get("ability")]
                    assert sorted(abilities) == (["connector", "scout"] if player["id"] == owner["playerId"] else [])


def test_leaving_frees_seat_colour_and_transfers_host_without_bots(client):
    room_id, host = new_lobby(client, 2)
    guest = join(client, room_id)
    guest_before = main.games[room_id]["players"][1]
    assert client.post(f"/games/{room_id}/leave-room", json=host).status_code == 200
    snapshot = state(client, room_id)
    assert snapshot["adminPlayerId"] == guest["playerId"]
    assert len(snapshot["players"]) == 1
    assert not snapshot["players"][0]["isBot"]
    assert host["color"] in [option["color"] for option in snapshot["availableColors"]]
    assert change_settings(client, room_id, guest, playerCount=3).status_code == 200
    assert main.games[room_id]["players"][0] is guest_before
    replacement = join(client, room_id)
    assert replacement["playerId"] != host["playerId"]
    assert len(state(client, room_id)["players"]) == 2
    assert client.post(f"/games/{room_id}/start", json=host).status_code == 403


def test_disconnect_and_reconnect_keep_seat_profile_and_host(client):
    room_id, host = new_lobby(client)
    with client.websocket_connect(socket_url(room_id, host)) as socket:
        socket.receive_json()
        client.patch(f"/games/{room_id}/profile", json={**host, "name": "Returning host", "color": "Pink"})
        socket.receive_json()
    with client.websocket_connect(socket_url(room_id, host)) as socket:
        snapshot = socket.receive_json()["game"]
        assert snapshot["adminPlayerId"] == host["playerId"]
        assert len(snapshot["players"]) == 1
        assert snapshot["players"][0]["name"] == "Returning host"
        assert snapshot["players"][0]["color"] == "Pink"


def test_last_departure_closes_room_and_lobby_quit_never_creates_bot(client):
    room_id, host = new_lobby(client)
    assert client.post(f"/games/{room_id}/quit", json=host).status_code == 200
    assert state(client, room_id)["players"] == []
    assert state(client, room_id)["status"] == "closed"
    assert client.post(f"/games/{room_id}/join", json={}).status_code == 409


def test_lobby_revisions_order_live_updates_and_http_responses(client):
    room_id, host = new_lobby(client)
    initial = state(client, room_id)["revision"]
    response = client.patch(f"/games/{room_id}/profile", json={**host, "name": "Updated host"})
    profile_revision = response.json()["revision"]
    assert profile_revision > initial
    response = change_settings(client, room_id, host, playerCount=3)
    settings_revision = response.json()["revision"]
    assert settings_revision > profile_revision
    join(client, room_id)
    assert state(client, room_id)["revision"] > settings_revision


def test_closed_socket_does_not_interrupt_lobby_updates(client):
    room_id, host = new_lobby(client)

    class ClosedSocket:
        state = SimpleNamespace(player_id=host["playerId"], player_token=host["playerToken"])

        async def send_json(self, message):
            raise WebSocketDisconnect(code=1006)

    closed = ClosedSocket()
    main.connections[room_id].add(closed)
    asyncio.run(main.broadcast_game(room_id))
    assert closed not in main.connections[room_id]
    response = client.patch(f"/games/{room_id}/profile", json={**host, "name": "Still connected"})
    assert response.status_code == 200


def test_host_adds_uncoloured_bot_to_exact_seat(client):
    room_id, host = new_lobby(client)
    response = client.post(f"/games/{room_id}/bots", json={**host, "seat": 4})
    assert response.status_code == 200
    bot = response.json()["players"][1]
    assert bot["isBot"] and bot["name"] == "Bot 1"
    assert bot["settingsPlayerKey"] == "Player 4"
    assert bot["color"] is None
    assert all("ability" not in piece for piece in bot["pieces"])
    guest = join(client, room_id)
    assert state(client, room_id)["players"][2]["settingsPlayerKey"] == "Player 2"
    assert guest["color"] == "Orange"
    assert client.post(f"/games/{room_id}/bots", json={**host, "seat": 4}).status_code == 409
    assert client.post(f"/games/{room_id}/bots", json={**host, "seat": 5}).status_code == 422


def test_fill_bots_keeps_humans_and_existing_bots_and_waits_for_manual_start(client):
    room_id, host = new_lobby(client, 6)
    guest = join(client, room_id)
    client.post(f"/games/{room_id}/bots", json={**host, "seat": 6})
    response = client.post(f"/games/{room_id}/fill-bots", json=host)
    assert response.status_code == 200
    snapshot = response.json()
    assert len(snapshot["players"]) == 6
    assert len({player["settingsPlayerKey"] for player in snapshot["players"]}) == 6
    assert {player["id"] for player in snapshot["players"] if not player["isBot"]} == {host["playerId"], guest["playerId"]}
    bots = [player for player in snapshot["players"] if player["isBot"]]
    assert [bot["name"] for bot in bots] == ["Bot 1", "Bot 2", "Bot 3", "Bot 4"]
    assert all(bot["color"] is None for bot in bots)
    assert {option["color"] for option in snapshot["availableColors"]}.isdisjoint(
        {player["color"] for player in snapshot["players"] if not player["isBot"]}
    )
    assert snapshot["status"] == "waiting"
    assert change_settings(client, room_id, host, playerCount=5).status_code == 409
    again = client.post(f"/games/{room_id}/fill-bots", json=host).json()
    assert [player["id"] for player in again["players"]] == [player["id"] for player in snapshot["players"]]
    full = client.post(f"/games/{room_id}/join", json={})
    assert full.status_code == 409 and full.json()["detail"] == "Room is full"
    assert client.post(f"/games/{room_id}/start", json=host).status_code == 200
    started = state(client, room_id)
    assert len(started["players"]) == 6
    assert len({player["color"] for player in started["players"]}) == 6
    assert all(player["color"] is not None for player in started["players"])
    assert client.post(f"/games/{room_id}/bots", json={**host, "seat": 3}).status_code == 409


def test_guests_cannot_manage_any_seats_or_impersonate_host(client):
    room_id, host = new_lobby(client)
    guest = join(client, room_id)
    assert client.post(f"/games/{room_id}/start-with-bots", json=guest).status_code == 403
    for credentials in [guest, {**host, "playerToken": guest["playerToken"]}]:
        for endpoint, data in [("bots", {"seat": 3}), ("fill-bots", {}), ("remove-player", {"targetPlayerId": host["playerId"]})]:
            assert client.post(f"/games/{room_id}/{endpoint}", json={**credentials, **data}).status_code == 403
    assert client.post(f"/games/{room_id}/remove-player", json={**host, "targetPlayerId": host["playerId"]}).status_code == 409
    assert len(state(client, room_id)["players"]) == 2


def test_remove_uncoloured_bot_frees_exact_seat_without_renumbering(client):
    room_id, host = new_lobby(client)
    snapshot = client.post(f"/games/{room_id}/fill-bots", json=host).json()
    bot = snapshot["players"][1]
    remaining_ids = [p["id"] for p in snapshot["players"] if p["id"] != bot["id"]]
    response = client.post(f"/games/{room_id}/remove-player", json={**host, "targetPlayerId": bot["id"]})
    assert response.status_code == 200
    assert [p["id"] for p in response.json()["players"]] == remaining_ids
    assert bot["color"] is None
    snapshot = client.post(f"/games/{room_id}/bots", json={**host, "seat": 2}).json()
    replacement = snapshot["players"][-1]
    assert replacement["name"] == "Bot 4"
    assert replacement["color"] is None
    assert replacement["settingsPlayerKey"] == "Player 2"
    assert replacement["id"] != bot["id"]


def test_removed_human_is_notified_and_old_credentials_cannot_reconnect(client):
    room_id, host = new_lobby(client)
    guest = join(client, room_id)
    with client.websocket_connect(socket_url(room_id, host)) as host_socket:
        host_socket.receive_json()
        with client.websocket_connect(socket_url(room_id, guest)) as guest_socket:
            host_socket.receive_json()
            guest_socket.receive_json()
            response = client.post(f"/games/{room_id}/remove-player", json={**host, "targetPlayerId": guest["playerId"]})
            assert response.status_code == 200
            assert guest_socket.receive_json() == {"type": "room_removed", "message": "You were removed from the room"}
            with pytest.raises(WebSocketDisconnect) as closed:
                guest_socket.receive_json()
            assert closed.value.code == 1008
            assert len(host_socket.receive_json()["game"]["players"]) == 1
    response = client.get(f"/games/{room_id}", headers={"X-Player-Id": guest["playerId"], "X-Player-Token": guest["playerToken"]})
    assert response.status_code == 403
    assert response.json()["detail"] == "You were removed from the room"
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(socket_url(room_id, guest)):
            pass
    assert "removedPlayers" not in state(client, room_id)
    replacement = join(client, room_id)
    assert replacement["playerId"] != guest["playerId"]
    assert replacement["color"] == guest["color"]


def test_seats_survive_bot_changes_and_player_count_resize(client):
    room_id, host = new_lobby(client, 6)
    snapshot = client.post(f"/games/{room_id}/bots", json={**host, "seat": 6}).json()
    bot_id = snapshot["players"][1]["id"]
    response = change_settings(client, room_id, host, playerCount=2)
    assert response.status_code == 200
    assert {p["settingsPlayerKey"] for p in response.json()["players"]} == {"Player 1", "Player 2"}
    assert response.json()["players"][1]["id"] == bot_id
    assert response.json()["settings"]["players"]["Player 2"]["isBot"]
    assert change_settings(client, room_id, host, playerCount=4).status_code == 200
    assert client.post(f"/games/{room_id}/start", json=host).status_code == 409


def test_lobby_bot_uses_existing_bot_turn_and_covers_assigned_start(client, monkeypatch):
    room_id, host = new_lobby(client, 2)
    client.post(f"/games/{room_id}/fill-bots", json=host)
    monkeypatch.setattr(main, "choose_starting_player_index", lambda _count: 1)
    assert client.post(f"/games/{room_id}/start", json=host).status_code == 200
    game = main.games[room_id]
    bot = game["players"][1]
    original_assignments = [piece.get("ability") for piece in bot["pieces"]]
    assert bot["isBot"]
    monkeypatch.setattr(main, "BOT_MOVE_DELAY_SECONDS", 0)
    asyncio.run(main.run_bot_turn(room_id, bot["id"]))
    move = game["moveHistory"][0]
    assert move["playerId"] == bot["id"] and move["source"] == "bot"
    assert bot["startPosition"] in move["cells"]
    assert game["currentTurnIndex"] == 0
    assert [piece.get("ability") for piece in bot["pieces"]] == original_assignments


def test_host_departure_transfers_to_human_not_bot_or_closes_bot_only_room(client):
    room_id, host = new_lobby(client)
    client.post(f"/games/{room_id}/bots", json={**host, "seat": 2})
    guest = join(client, room_id)
    client.post(f"/games/{room_id}/leave-room", json=host)
    assert state(client, room_id)["adminPlayerId"] == guest["playerId"]
    assert client.post(f"/games/{room_id}/fill-bots", json=guest).status_code == 200
    client.post(f"/games/{room_id}/leave-room", json=guest)
    assert state(client, room_id)["status"] == "closed"
    assert state(client, room_id)["players"] == []


@pytest.mark.parametrize("player_count", [1, 7])
def test_lobby_slot_count_must_stay_between_two_and_six(client, player_count):
    response = client.post("/games", json={"settings": {
        "lobbyMode": True,
        "boardLayout": "irregular",
        "playerCount": player_count,
        "moveTimeLimitSeconds": 60,
    }})
    assert response.status_code == 422


def test_only_empty_slots_can_be_removed(client):
    room_id, host = new_lobby(client, 3)
    join(client, room_id)
    join(client, room_id)
    assert change_settings(client, room_id, host, playerCount=2).status_code == 409
    assert state(client, room_id)["settings"]["playerCount"] == 3


def test_start_with_bots_fills_empty_slots_and_starts_atomically(client):
    room_id, host = new_lobby(client, 4)
    guest = join(client, room_id)
    response = client.post(f"/games/{room_id}/start-with-bots", json=host)
    assert response.status_code == 200
    snapshot = response.json()
    assert snapshot["status"] == "playing"
    assert len(snapshot["players"]) == 4
    assert sum(player["isBot"] for player in snapshot["players"]) == 2
    assert len({player["color"] for player in snapshot["players"]}) == 4
    assert client.post(f"/games/{room_id}/start-with-bots", json=guest).status_code == 409


def test_bots_do_not_reserve_colours_before_the_game_starts(client):
    room_id, host = new_lobby(client)
    snapshot = client.post(f"/games/{room_id}/bots", json={**host, "seat": 2}).json()
    bot = next(player for player in snapshot["players"] if player["isBot"])
    assert bot["color"] is None
    assert client.patch(f"/games/{room_id}/profile", json={**host, "color": "Orange"}).status_code == 200
    assert "Orange" not in {option["color"] for option in state(client, room_id)["availableColors"]}
