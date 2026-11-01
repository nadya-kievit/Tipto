import asyncio

from fastapi.testclient import TestClient

import app.main as main_module
from app.main import (
    MoveRequest,
    app,
    apply_move,
    choose_random_bot_move,
    finish_game,
    games,
    refresh_out_of_moves,
    validate_player_move,
)


client = TestClient(app)


def setup_function():
    for task in main_module.turn_tasks.values():
        task.cancel()
    main_module.turn_tasks.clear()
    games.clear()
    main_module.choose_starting_player_index = lambda _player_count: 0
    main_module.choose_start_positions = (
        lambda start_positions, player_count: list(start_positions)[:player_count]
    )


def create_joined_game():
    game_id = client.post("/games").json()["gameId"]
    players = [
        client.post(f"/games/{game_id}/join", json={"color": color}).json()
        for color in ["Blue", "Red", "Green", "Yellow"]
    ]
    return game_id, players


def move_payload(player, piece_name, cells):
    return {
        "playerId": player["playerId"],
        "playerToken": player["playerToken"],
        "pieceName": piece_name,
        "cells": cells,
    }


def place_piece(game_id, player, piece_name, cells):
    with client.websocket_connect(
        f"/games/{game_id}/ws?playerId={player['playerId']}&token={player['playerToken']}"
    ) as websocket:
        websocket.receive_json()
        websocket.send_json({
            "type": "place_piece",
            "pieceName": piece_name,
            "cells": cells,
        })

        for _ in range(4):
            message = websocket.receive_json()
            if message["type"] == "error":
                return message
            if message["type"] == "game_state":
                return message


def assigned_cell(game_id, player):
    runtime_player = next(
        candidate
        for candidate in games[game_id]["players"]
        if candidate["id"] == player["playerId"]
    )
    return dict(runtime_player["startPosition"])


def place_first_pieces(game_id, players):
    for player in players:
        place_piece(game_id, player, "I1", [assigned_cell(game_id, player)])


def test_creating_multiple_games_keeps_boards_isolated():
    first_game_id, first_players = create_joined_game()
    second_game_id, _ = create_joined_game()

    first_start = assigned_cell(first_game_id, first_players[0])
    place_piece(first_game_id, first_players[0], "I1", [first_start])

    first_state = client.get(f"/games/{first_game_id}").json()
    second_state = client.get(f"/games/{second_game_id}").json()

    row, col = first_start["row"], first_start["col"]
    assert first_state["board"][row][col]["occupied"] is True
    assert first_state["board"][row][col]["pieceId"] == "p1-I1"
    assert second_state["board"][row][col]["occupied"] is False
    assert second_state["board"][row][col]["pieceId"] is None


def test_four_players_fill_seats_and_fifth_join_is_rejected():
    game_id, players = create_joined_game()
    response = client.post(f"/games/{game_id}/join", json={"color": "Blue"})

    assert [player["playerId"] for player in players] == ["p1", "p2", "p3", "p4"]
    assert response.status_code == 409


def test_starting_player_is_random_and_turns_then_move_clockwise():
    main_module.choose_starting_player_index = lambda _player_count: 2
    game_id = client.post("/games").json()["gameId"]

    for color in ["Green", "Blue", "Yellow", "Red"]:
        client.post(f"/games/{game_id}/join", json={"color": color})

    game = games[game_id]

    assert [player["color"] for player in game["players"]] == [
        "Green",
        "Blue",
        "Yellow",
        "Red",
    ]
    assert game["players"][game["currentTurnIndex"]]["color"] == "Yellow"

    main_module.advance_turn(game)
    assert game["players"][game["currentTurnIndex"]]["color"] == "Red"

    main_module.advance_turn(game)
    assert game["players"][game["currentTurnIndex"]]["color"] == "Green"


def test_game_uses_six_digit_invite_code_and_players_choose_colors():
    game_id = client.post("/games").json()["inviteCode"]
    red = client.post(f"/games/{game_id}/join", json={"color": "Red"})
    duplicate = client.post(f"/games/{game_id}/join", json={"color": "Red"})

    assert len(game_id) == 6 and game_id.isdigit()
    assert red.json()["name"] == "Red"
    assert red.json()["color"] == "Red"
    assert duplicate.status_code == 409


def test_game_offers_eight_colors_but_still_uses_four_player_corners():
    game_id = client.post("/games").json()["gameId"]
    initial_state = client.get(f"/games/{game_id}").json()

    assert [option["color"] for option in initial_state["availableColors"]] == [
        "Blue", "Red", "Green", "Yellow", "Pink", "Purple", "Cyan", "Orange",
    ]

    for color in ["Pink", "Purple", "Cyan", "Orange"]:
        response = client.post(f"/games/{game_id}/join", json={"color": color})
        assert response.status_code == 200

    state = client.get(f"/games/{game_id}").json()
    corners = {
        (player["corner"]["row"], player["corner"]["col"])
        for player in state["players"]
    }

    assert state["status"] == "playing"
    assert len(state["players"]) == 4
    assert len(corners) == 4


def test_joined_player_name_is_trimmed_and_shared_in_game_state():
    game_id = client.post("/games").json()["gameId"]
    joined = client.post(
        f"/games/{game_id}/join",
        json={"color": "Blue", "name": "  Block Master  "},
    )

    assert joined.status_code == 200
    assert joined.json()["name"] == "Block Master"
    assert joined.json()["color"] == "Blue"

    state = client.get(f"/games/{game_id}").json()
    assert state["players"][0]["name"] == "Block Master"
    assert state["players"][0]["color"] == "Blue"


def test_game_stores_settings_selected_when_room_is_created():
    response = client.post(
        "/games",
        json={
            "settings": {
                "moveTimeLimitSeconds": 60,
                "players": {
                    "Player 1": {"color": None, "isBot": False},
                    "Player 2": {"color": None, "isBot": True},
                    "Player 3": {"color": None, "isBot": True},
                    "Player 4": {"color": None, "isBot": True},
                },
            },
        },
    )

    assert response.status_code == 200
    game = response.json()
    assert game["settings"] == {
        "moveTimeLimitSeconds": 60,
        "boardLayout": "square",
        "playerCount": 4,
        "players": {
            "Player 1": {"color": None, "isBot": False},
            "Player 2": {"color": None, "isBot": True},
            "Player 3": {"color": None, "isBot": True},
            "Player 4": {"color": None, "isBot": True},
        },
    }
    assert games[game["gameId"]]["settings"] == game["settings"]


def test_quitting_converts_player_to_bot_and_preserves_their_board_pieces():
    game_id, players = create_joined_game()
    first_start = assigned_cell(game_id, players[0])
    place_piece(game_id, players[0], "I1", [first_start])

    response = client.post(
        f"/games/{game_id}/quit",
        json={"playerId": players[0]["playerId"], "playerToken": players[0]["playerToken"]},
    )
    state = client.get(f"/games/{game_id}").json()

    assert response.json() == {"success": True}
    assert state["board"][first_start["row"]][first_start["col"]]["occupied"] is True
    assert len(state["players"]) == 4
    assert state["players"][0]["isBot"] is True
    assert state["currentPlayerId"] == players[1]["playerId"]
    assert state["settings"]["players"]["Player 1"] == {
        "color": "Blue",
        "isBot": True,
    }
    assert "left the game" in state["notice"]


def test_creator_is_admin_and_admin_transfers_to_earliest_remaining_player():
    created_game = client.post("/games").json()
    game_id = created_game["gameId"]
    red = client.post(f"/games/{game_id}/join", json={"color": "Red"}).json()
    blue_admin = client.post(
        f"/games/{game_id}/join",
        json={"color": "Blue", "adminToken": created_game["adminToken"]},
    ).json()
    green = client.post(f"/games/{game_id}/join", json={"color": "Green"}).json()

    assert client.get(f"/games/{game_id}").json()["adminPlayerId"] == blue_admin["playerId"]

    client.post(
        f"/games/{game_id}/quit",
        json={
            "playerId": blue_admin["playerId"],
            "playerToken": blue_admin["playerToken"],
        },
    )
    state = client.get(f"/games/{game_id}").json()

    assert state["adminPlayerId"] == red["playerId"]
    assert state["settings"]["players"]["Player 2"] == {
        "color": "Blue",
        "isBot": True,
    }
    assert green["playerId"] != state["adminPlayerId"]


def test_game_is_deleted_when_last_human_quits():
    created_game = client.post("/games").json()
    game_id = created_game["gameId"]
    player = client.post(
        f"/games/{game_id}/join",
        json={"color": "Blue", "adminToken": created_game["adminToken"]},
    ).json()

    client.post(
        f"/games/{game_id}/quit",
        json={"playerId": player["playerId"], "playerToken": player["playerToken"]},
    )
    assert client.get(f"/games/{game_id}").status_code == 404
    assert game_id not in games
    assert game_id not in main_module.connections
    assert game_id not in main_module.turn_tasks


def test_game_starts_after_all_configured_humans_join():
    created_game = client.post(
        "/games",
        json={
            "settings": {
                "players": {
                    "Player 1": {"isBot": False},
                    "Player 2": {"isBot": False},
                    "Player 3": {"isBot": True},
                    "Player 4": {"isBot": True},
                },
            },
        },
    ).json()
    game_id = created_game["gameId"]

    client.post(f"/games/{game_id}/join", json={"color": "Blue"})
    waiting_state = client.get(f"/games/{game_id}").json()
    client.post(
        f"/games/{game_id}/join",
        json={"color": "Red", "adminToken": created_game["adminToken"]},
    )
    playing_state = client.get(f"/games/{game_id}").json()

    assert waiting_state["status"] == "waiting"
    assert waiting_state["settings"]["players"]["Player 1"]["color"] == "Blue"
    assert waiting_state["settings"]["players"]["Player 2"]["color"] is None
    assert playing_state["status"] == "playing"
    assert playing_state["settings"]["players"]["Player 2"]["color"] == "Red"


def test_configured_bots_receive_remaining_colors_and_can_make_valid_moves():
    created_game = client.post(
        "/games",
        json={
            "settings": {
                "players": {
                    "Player 1": {"isBot": False},
                    "Player 2": {"isBot": True},
                    "Player 3": {"isBot": True},
                    "Player 4": {"isBot": True},
                },
            },
        },
    ).json()
    game_id = created_game["gameId"]
    client.post(
        f"/games/{game_id}/join",
        json={"color": "Blue", "adminToken": created_game["adminToken"]},
    )
    game = games[game_id]

    assert len(game["players"]) == 4
    assert [player["isBot"] for player in game["players"]] == [
        False,
        True,
        True,
        True,
    ]
    assigned_colors = {player["color"] for player in game["players"]}
    assert len(assigned_colors) == 4
    assert "Blue" in assigned_colors
    assert assigned_colors <= {
        option["color"] for option in main_module.PLAYER_COLORS
    }

    game["currentTurnIndex"] = 1
    bot = game["players"][1]
    move = choose_random_bot_move(game, bot)
    result = validate_player_move(
        game,
        bot,
        MoveRequest(
            cells=move["cells"],
            pieceName=move["pieceName"],
            playerId=bot["id"],
            playerToken="",
        ),
    )

    assert result["valid"] is True
    apply_move(game, bot, move["pieceName"], move["cells"])
    assert game["moveHistory"][-1]["playerId"] == bot["id"]


def test_bot_turn_waits_then_places_a_piece(monkeypatch):
    main_module.choose_starting_player_index = lambda _player_count: 0
    created_game = client.post(
        "/games",
        json={
            "settings": {
                "players": {
                    "Player 1": {"isBot": True},
                    "Player 2": {"isBot": False},
                    "Player 3": {"isBot": True},
                    "Player 4": {"isBot": True},
                },
            },
        },
    ).json()
    game_id = created_game["gameId"]
    client.post(
        f"/games/{game_id}/join",
        json={"color": "Blue", "adminToken": created_game["adminToken"]},
    )
    game = games[game_id]
    bot = game["players"][game["currentTurnIndex"]]
    monkeypatch.setattr(main_module, "BOT_MOVE_DELAY_SECONDS", 0)

    asyncio.run(main_module.run_bot_turn(game_id, bot["id"]))

    assert game["moveHistory"]
    assert game["moveHistory"][0]["playerId"] == bot["id"]


def test_timed_out_human_gets_an_automatic_move_and_a_new_turn_starts():
    created_game = client.post(
        "/games",
        json={"settings": {"moveTimeLimitSeconds": 30}},
    ).json()
    game_id = created_game["gameId"]
    players = [
        client.post(f"/games/{game_id}/join", json={"color": color}).json()
        for color in ["Blue", "Red", "Green", "Yellow"]
    ]
    game = games[game_id]
    timed_out_player = game["players"][game["currentTurnIndex"]]
    expired_turn_number = game["turnNumber"]

    task = main_module.turn_tasks.pop(game_id, None)
    if task and not task.done():
        task.cancel()

    asyncio.run(main_module.run_automatic_turn(
        game_id,
        timed_out_player["id"],
        expired_turn_number,
        0,
        "timeout",
    ))

    assert game["moveHistory"][0]["playerId"] == players[0]["playerId"]
    assert game["moveHistory"][0]["source"] == "timeout"
    assert timed_out_player["isBot"] is False
    assert game["currentTurnIndex"] == 1
    assert game["turnNumber"] == expired_turn_number + 1
    assert game["turnEndsAt"] is not None
    assert "ran out of time" in game["notice"]


def test_stale_timeout_cannot_place_during_a_later_turn():
    game_id, _ = create_joined_game()
    game = games[game_id]
    player = game["players"][0]
    stale_turn_number = game["turnNumber"]
    main_module.advance_turn(game)

    asyncio.run(main_module.run_automatic_turn(
        game_id,
        player["id"],
        stale_turn_number,
        0,
        "timeout",
    ))

    assert game["moveHistory"] == []


def test_move_is_rejected_after_the_server_deadline():
    game_id, players = create_joined_game()
    game = games[game_id]
    game["turnEndsAt"] = 0

    result = validate_player_move(
        game,
        game["players"][0],
        MoveRequest(
            cells=[{"row": 0, "col": 0}],
            pieceName="I1",
            playerId=players[0]["playerId"],
            playerToken=players[0]["playerToken"],
        ),
    )

    assert result == {
        "valid": False,
        "reason": "Your turn time has expired.",
    }


def test_human_converted_before_start_is_not_duplicated_as_a_bot():
    created_game = client.post(
        "/games",
        json={
            "settings": {
                "players": {
                    "Player 1": {"isBot": False},
                    "Player 2": {"isBot": False},
                    "Player 3": {"isBot": False},
                    "Player 4": {"isBot": True},
                },
            },
        },
    ).json()
    game_id = created_game["gameId"]
    first = client.post(
        f"/games/{game_id}/join",
        json={"color": "Blue", "adminToken": created_game["adminToken"]},
    ).json()
    client.post(
        f"/games/{game_id}/join",
        json={"color": "Red"},
    )
    client.post(
        f"/games/{game_id}/quit",
        json={"playerId": first["playerId"], "playerToken": first["playerToken"]},
    )
    client.post(
        f"/games/{game_id}/join",
        json={"color": "Green"},
    )
    game = games[game_id]

    assert game["status"] == "playing"
    assert len(game["players"]) == 4
    assert len({
        player["settingsPlayerKey"] for player in game["players"]
    }) == 4


def test_first_move_must_cover_player_corner():
    game_id, players = create_joined_game()
    response = client.post(
        f"/games/{game_id}/validate-move",
        json=move_payload(players[0], "I1", [{"row": 1, "col": 1}]),
    )

    assert response.json()["valid"] is False
    assert "starting square" in response.json()["reason"]


def test_players_cannot_move_out_of_turn():
    game_id, players = create_joined_game()
    response = client.post(
        f"/games/{game_id}/validate-move",
        json=move_payload(players[1], "I1", [{"row": 0, "col": 19}]),
    )

    assert response.json() == {
        "valid": False,
        "reason": "It is not your turn.",
    }


def test_players_cannot_use_another_players_piece_after_they_place_it():
    game_id, players = create_joined_game()

    place_piece(game_id, players[0], "I1", [assigned_cell(game_id, players[0])])

    response = client.post(
        f"/games/{game_id}/validate-move",
        json=move_payload(players[1], "I1", [assigned_cell(game_id, players[1])]),
    )

    assert response.json()["valid"] is True


def test_same_color_diagonal_and_side_rules_are_enforced():
    game_id, players = create_joined_game()
    # This test exercises ordinary-piece rules, regardless of random assignments.
    next(piece for piece in games[game_id]["players"][0]["pieces"] if piece["name"] == "I2").pop("ability", None)

    place_first_pieces(game_id, players)

    side_response = client.post(
        f"/games/{game_id}/validate-move",
        json=move_payload(
            players[0],
            "I2",
            [{"row": 3, "col": 4}, {"row": 3, "col": 5}],
        ),
    )
    diagonal_response = client.post(
        f"/games/{game_id}/validate-move",
        json=move_payload(
            players[0],
            "I2",
            [{"row": 4, "col": 4}, {"row": 4, "col": 5}],
        ),
    )

    assert side_response.json()["valid"] is False
    assert diagonal_response.json()["valid"] is True


def test_other_players_do_not_count_as_diagonal_contact():
    game_id, players = create_joined_game()
    next(piece for piece in games[game_id]["players"][0]["pieces"] if piece["name"] == "I2").pop("ability", None)

    place_first_pieces(game_id, players)

    response = client.post(
        f"/games/{game_id}/validate-move",
        json=move_payload(
            players[0],
            "I2",
            [{"row": 4, "col": 12}, {"row": 4, "col": 11}],
        ),
    )

    assert response.json() == {
        "valid": False,
        "reason": "Piece must touch one of your pieces diagonally.",
    }


def test_player_with_no_available_moves_is_marked_and_skipped():
    game_id, players = create_joined_game()
    game = games[game_id]
    game["board"].place_piece(
        [assigned_cell(game_id, players[0])],
        player=players[1]["playerId"],
    )

    refresh_out_of_moves(game)

    state = client.get(f"/games/{game_id}").json()
    blue = next(player for player in state["players"] if player["color"] == "Blue")

    assert state["status"] == "playing"
    assert blue["isOutOfMoves"] is True
    assert "Blue ran out of moves" in state["notice"]


def test_game_finishes_with_leaderboard_when_everyone_is_out_of_moves():
    game_id, _ = create_joined_game()
    game = games[game_id]

    for row in game["board"].grid:
        for cell in row:
            if cell["playable"]:
                cell.update({"occupied": True, "player": "blocked"})

    for index, player in enumerate(game["players"]):
        for piece in player["pieces"][:index + 1]:
            piece["placed"] = True

    refresh_out_of_moves(game)
    state = client.get(f"/games/{game_id}").json()

    assert state["status"] == "finished"
    assert state["leaderboard"][0]["name"] == "Yellow"
    assert state["leaderboard"][0]["rank"] == 1
    assert state["winnerId"] == game["players"][3]["id"]
    assert state["winnerIds"] == [game["players"][3]["id"]]
    assert state["currentPlayerId"] is None


def test_game_finishes_as_a_tie_when_leaders_have_the_same_score():
    game_id, _ = create_joined_game()
    game = games[game_id]

    for player in game["players"][:2]:
        player["pieces"][0]["placed"] = True

    finish_game(game)
    state = client.get(f"/games/{game_id}").json()

    expected_winner_ids = [player["id"] for player in game["players"][:2]]
    assert state["winnerId"] is None
    assert state["winnerIds"] == expected_winner_ids
    assert [entry["rank"] for entry in state["leaderboard"]] == [1, 1, 3, 3]
    assert "Tie between Blue and Red with 5 blocks" in state["notice"]


def test_tied_game_restarts_with_a_tied_leader_first():
    game_id, players = create_joined_game()
    game = games[game_id]

    for player in game["players"][:2]:
        player["pieces"][0]["placed"] = True

    finish_game(game)
    response = client.post(
        f"/games/{game_id}/restart",
        json={"playerId": players[2]["playerId"], "playerToken": players[2]["playerToken"]},
    )
    state = response.json()

    assert response.status_code == 200
    assert state["currentPlayerId"] == players[0]["playerId"]
    assert state["winnerId"] is None
    assert state["winnerIds"] == []


def test_finished_game_can_restart_with_same_players_and_winner_first():
    game_id, players = create_joined_game()
    game = games[game_id]
    game["board"].place_piece([{"row": 0, "col": 0}], player=players[1]["playerId"])

    for piece in game["players"][1]["pieces"][:3]:
        piece["placed"] = True

    finish_game(game)

    response = client.post(
        f"/games/{game_id}/restart",
        json={"playerId": players[0]["playerId"], "playerToken": players[0]["playerToken"]},
    )
    state = response.json()

    assert response.status_code == 200
    assert state["status"] == "playing"
    assert state["currentPlayerId"] == players[1]["playerId"]
    assert len(state["players"]) == 4
    assert state["board"][0][0]["occupied"] is False
    assert all(not piece["placed"] for player in state["players"] for piece in player["pieces"])
    assert "Red goes first" in state["notice"]
