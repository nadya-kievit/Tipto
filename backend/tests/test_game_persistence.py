import os
import time
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.game_store import GameDatabaseUnavailable


@pytest.fixture
def saved_game_client(monkeypatch):
    database_url = os.environ.get("TIPTO_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set TIPTO_TEST_DATABASE_URL to a disposable migrated database.")

    import psycopg

    monkeypatch.setenv("DATABASE_URL", database_url)
    room_ids = []

    @contextmanager
    def connect(*, automatic_turns=False):
        # Clear process-local state so each lifespan loads the room from Postgres.
        main.games.clear()
        main.connections.clear()
        main.game_locks.clear()
        with monkeypatch.context() as patch:
            if not automatic_turns:
                patch.setattr(main, "schedule_turn", lambda game_id: None)
            with TestClient(main.app) as client:
                yield client

    yield connect, room_ids, database_url

    main.games.clear()
    main.connections.clear()
    main.game_locks.clear()
    with psycopg.connect(database_url) as connection:
        connection.execute("delete from tipto.games where id = any(%s)", (room_ids,))


def player_headers(credentials):
    return {
        "X-Player-Id": credentials["playerId"],
        "X-Player-Token": credentials["playerToken"],
    }


def place_piece(client, path, credentials):
    room_id = path.rsplit("/", 1)[-1]
    game = main.games[room_id]
    player = main.get_player(game, credentials["playerId"])
    move = main.choose_automatic_move(game, player)
    assert move is not None
    with client.websocket_connect(
        f'{path}/ws?playerId={credentials["playerId"]}&token={credentials["playerToken"]}'
    ) as socket:
        assert socket.receive_json()["type"] == "game_state"
        socket.send_json({"type": "place_piece", **move})
        message = socket.receive_json()
        assert message["type"] == "game_state", message
        return message["game"]


def test_lobby_and_match_survive_restart(saved_game_client, monkeypatch):
    import psycopg

    connect, room_ids, database_url = saved_game_client
    monkeypatch.setattr(main, "choose_starting_player_index", lambda count: 0)
    with connect() as client:
        result = client.post("/games", json={"settings": {"lobbyMode": True}})
        assert result.status_code == 200, result.text
        room = result.json()
        room_id = room["gameId"]
        room_ids.append(room_id)

    path = f"/games/{room_id}"
    with connect() as client:
        # The original invite must work even if the host hadn't joined before the restart.
        host_result = client.post(f"{path}/join", json={"adminToken": room["adminToken"], "name": "Host"})
        assert host_result.status_code == 200, host_result.text
        host = host_result.json()
        guest_result = client.post(f"{path}/join", json={"name": "Guest"})
        assert guest_result.status_code == 200, guest_result.text
        guest = guest_result.json()
        assert client.post(f"{path}/bots", json=host).is_success
        assert client.patch(f"{path}/settings", json={
            **host, "boardLayout": "rooms", "moveTimeLimitSeconds": 45,
        }).is_success
        result = client.patch(f"{path}/profile", json={**guest, "name": "Updated guest"})
        assert result.is_success
        revision = result.json()["revision"]
        pieces = result.json()["players"][1]["pieces"]

    with psycopg.connect(database_url) as connection:
        room_hash, game_state = connection.execute(
            "select admin_token_hash, state from tipto.games where id = %s", (room_id,),
        ).fetchone()
        player_hash, player_state = connection.execute(
            "select player_token_hash, state from tipto.players where game_id = %s and player_id = %s",
            (room_id, guest["playerId"]),
        ).fetchone()
        assert len(room_hash) == len(player_hash) == 64
        assert room["adminToken"] not in repr(game_state)
        assert guest["playerToken"] not in repr(player_state)

    with connect() as client:
        result = client.get(path, headers=player_headers(guest))
        assert result.status_code == 200, result.text
        restored = result.json()
        assert restored["status"] == "waiting"
        assert restored["revision"] == revision
        assert restored["adminPlayerId"] == host["playerId"]
        assert restored["settings"]["boardLayout"] == "rooms"
        assert restored["settings"]["moveTimeLimitSeconds"] == 45
        assert [player["name"] for player in restored["players"]] == ["Host", "Updated guest", "Bot 1"]
        assert restored["players"][1]["pieces"] == pieces
        assert not restored["players"][1]["connected"]

        with client.websocket_connect(
            f'{path}/ws?playerId={guest["playerId"]}&token={guest["playerToken"]}'
        ) as socket:
            assert socket.receive_json()["game"]["players"][1]["connected"]

        result = client.post(f"{path}/start", json=host)
        assert result.status_code == 200, result.text
        assert result.json()["status"] == "playing"
        before_restart = place_piece(client, path, host)
        assert before_restart["currentPlayerId"] == guest["playerId"]
        assert len(before_restart["moveHistory"]) == 1

    with connect() as client:
        restored = client.get(path, headers=player_headers(host)).json()
        for key in ("board", "moveHistory", "revision", "turnNumber", "currentPlayerId"):
            assert restored[key] == before_restart[key]
        assert restored["turnEndsAt"] == pytest.approx(before_restart["turnEndsAt"], rel=0, abs=0.001)
        after_restart = place_piece(client, path, guest)
        assert after_restart["moveHistory"][0] == before_restart["moveHistory"][0]
        assert len(after_restart["moveHistory"]) == 2


def test_failed_save_keeps_previous_room_and_last_player_leaving_deletes_it(saved_game_client, monkeypatch):
    connect, room_ids, _ = saved_game_client
    with connect() as client:
        created = client.post("/games", json={"settings": {"lobbyMode": True}})
        assert created.is_success
        room = created.json()
        room_ids.append(room["gameId"])
        path = f'/games/{room["gameId"]}'
        joined = client.post(f"{path}/join", json={"adminToken": room["adminToken"], "name": "Host"})
        assert joined.is_success
        host = joined.json()
        initial = client.get(path, headers=player_headers(host)).json()

        def fail_save(*args):
            raise GameDatabaseUnavailable

        with monkeypatch.context() as patch:
            patch.setattr(main.app.state.game_store, "save", fail_save)
            result = client.patch(f"{path}/profile", json={**host, "name": "Unsaved"})

        assert result.status_code == 503
        assert client.get(path, headers=player_headers(host)).json() == initial
        assert client.post(f"{path}/leave-room", json=host).is_success

    with connect() as client:
        assert client.get(path).status_code == 404


@pytest.mark.parametrize("source", ["timeout", "bot"])
def test_startup_resumes_saved_automatic_turn(saved_game_client, monkeypatch, source):
    import psycopg

    connect, room_ids, database_url = saved_game_client
    monkeypatch.setattr(main, "choose_starting_player_index", lambda count: int(source == "bot"))
    monkeypatch.setattr(main, "BOT_MOVE_DELAY_SECONDS", 0)
    with connect() as client:
        created = client.post("/games", json={
            "settings": {"lobbyMode": True, "moveTimeLimitSeconds": 30},
        })
        assert created.is_success
        room = created.json()
        room_ids.append(room["gameId"])
        path = f'/games/{room["gameId"]}'
        joined = client.post(f"{path}/join", json={"adminToken": room["adminToken"]})
        assert joined.is_success
        host = joined.json()
        if source == "bot":
            assert client.post(f"{path}/bots", json=host).is_success
        else:
            assert client.post(f"{path}/join", json={}).is_success
        started = client.post(f"{path}/start", json=host)
        assert started.is_success
        before = started.json()
        assert before["moveHistory"] == []

    if source == "timeout":
        with psycopg.connect(database_url) as connection:
            connection.execute(
                "update tipto.games set turn_ends_at = now() - interval '20 seconds' where id = %s",
                (room["gameId"],),
            )

    with connect(automatic_turns=True) as client:
        limit = time.monotonic() + 5
        while time.monotonic() < limit:
            result = client.get(path, headers=player_headers(host))
            assert result.is_success
            after = result.json()
            if after["moveHistory"]:
                break
            time.sleep(0.025)
        assert len(after["moveHistory"]) == 1
        assert after["moveHistory"][0]["source"] == source
        assert after["moveHistory"][0]["playerId"] == before["currentPlayerId"]
        assert after["currentPlayerId"] != before["currentPlayerId"]
        assert after["turnNumber"] == before["turnNumber"] + 1
        assert 25_000 < after["turnEndsAt"] - time.time() * 1000 <= 30_000

    with connect() as client:
        restored = client.get(path, headers=player_headers(host)).json()
        assert restored["board"] == after["board"]
        assert restored["moveHistory"] == after["moveHistory"]
