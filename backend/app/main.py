import asyncio
from copy import deepcopy
import random
import secrets
import time

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.websockets import WebSocketState

from app.game.board import Board
from app.game.board_layouts import (
    SUPPORTED_LAYOUTS,
    SUPPORTED_PLAYER_COUNTS,
    get_board_config,
)
from app.game.pieces import ALL_PIECES
from app.game.rules import validate_move


app = FastAPI()

@app.get("/health")
async def health_check():
    return {"status": "ok"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


MIN_PLAYERS = min(SUPPORTED_PLAYER_COUNTS)
MAX_PLAYERS = max(SUPPORTED_PLAYER_COUNTS)

PLAYER_COLORS = [
    {"color": "Blue"},
    {"color": "Red"},
    {"color": "Green"},
    {"color": "Yellow"},
    {"color": "Pink"},
    {"color": "Purple"},
    {"color": "Cyan"},
    {"color": "Orange"},
]

LOBBY_COLOR_ORDER = ["Purple", "Orange", "Red", "Cyan", "Blue", "Yellow", "Pink", "Green"]

games = {}
connections = {}
turn_tasks = {}

BOT_MOVE_DELAY_SECONDS = 2


class MoveRequest(BaseModel):
    cells: list[dict]
    pieceName: str
    playerId: str
    playerToken: str


class JoinRequest(BaseModel):
    color: str | None = None
    name: str | None = Field(default=None, max_length=24)
    adminToken: str | None = None


class PlayerSettingsRequest(BaseModel):
    color: str | None = None
    isBot: bool = False


class GameSettingsRequest(BaseModel):
    moveTimeLimitSeconds: int | None = None
    boardLayout: str = "square"
    playerCount: int = Field(default=4, ge=MIN_PLAYERS, le=MAX_PLAYERS)
    players: dict[str, PlayerSettingsRequest] = Field(default_factory=dict)
    lobbyMode: bool = False


class CreateGameRequest(BaseModel):
    settings: GameSettingsRequest = Field(default_factory=GameSettingsRequest)


class QuitRequest(BaseModel):
    playerId: str
    playerToken: str


class RestartRequest(BaseModel):
    playerId: str
    playerToken: str


class LobbyProfileRequest(QuitRequest):
    name: str | None = Field(default=None, max_length=24)
    color: str | None = None


class LobbySettingsRequest(QuitRequest):
    boardLayout: str
    moveTimeLimitSeconds: int | None


class RemoveLobbyPlayerRequest(QuitRequest):
    targetPlayerId: str


def make_piece_set():
    pieces = [
        {
            "name": piece.name,
            "cells": list(piece.cells),
            "placed": False,
        }
        for piece in ALL_PIECES
    ]
    scout, connector = random.sample(pieces, 2)
    scout["ability"] = "scout"
    connector["ability"] = "connector"
    return pieces


def make_runtime_player(
    color_option,
    player_number,
    settings_player_key,
    is_bot=False,
    player_name=None,
):
    return {
        **deepcopy(color_option),
        "corner": None,
        "startPosition": None,
        "id": f"p{player_number}",
        "name": player_name or (
            f'{color_option["color"]} Bot' if is_bot else color_option["color"]
        ),
        "settingsPlayerKey": settings_player_key,
        "token": None if is_bot else secrets.token_urlsafe(16),
        "pieces": make_piece_set(),
        "connected": is_bot,
        "isBot": is_bot,
        "isOutOfMoves": False,
        "joinedOrder": None if is_bot else player_number,
    }


def normalize_game_settings(settings):
    allowed_time_limits = {None, *range(30, 91, 5)}
    if settings.moveTimeLimitSeconds not in allowed_time_limits:
        raise HTTPException(
            status_code=422,
            detail="Time limit must be no limit or a multiple of 5 from 30 to 90 seconds.",
        )

    if settings.boardLayout not in SUPPORTED_LAYOUTS:
        raise HTTPException(
            status_code=422,
            detail="Board layout must be square, irregular, or rooms.",
        )

    players = {}
    for index in range(1, settings.playerCount + 1):
        player_key = f"Player {index}"
        supplied_player = settings.players.get(player_key)
        players[player_key] = {
            "color": None,
            "isBot": supplied_player.isBot if supplied_player and not settings.lobbyMode else False,
        }

    if all(player["isBot"] for player in players.values()):
        raise HTTPException(
            status_code=422,
            detail="At least one player must be human.",
        )

    return {
        "moveTimeLimitSeconds": settings.moveTimeLimitSeconds,
        "boardLayout": settings.boardLayout,
        "playerCount": settings.playerCount,
        "players": players,
    }


def create_game_state(game_id, settings):
    normalized_settings = normalize_game_settings(settings)
    board_config = get_board_config(
        normalized_settings["boardLayout"],
        normalized_settings["playerCount"],
    )

    return {
        "gameId": game_id,
        "revision": 0,
        "settings": normalized_settings,
        "lobbyMode": settings.lobbyMode,
        "boardConfig": board_config,
        "adminPlayerId": None,
        "adminToken": secrets.token_urlsafe(24),
        "board": Board(board_config),
        "players": [],
        "currentTurnIndex": 0,
        "turnNumber": 0,
        "turnEndsAt": None,
        "moveHistory": [],
        "status": "waiting",
        "hasStarted": False,
        "nextPlayerNumber": 1,
        "removedPlayers": {},
        "notice": None,
        "winnerId": None,
        "winnerIds": [],
        "leaderboard": [],
    }


def public_player(player, viewer_id=None):
    return {
        "id": player["id"],
        "name": player["name"],
        "color": player["color"],
        "corner": player["corner"],
        "startPosition": player["startPosition"],
        "connected": player["connected"],
        "pieces": [
            {
                "name": piece["name"],
                "cells": list(piece["cells"]),
                "placed": piece["placed"],
                **(
                    {"ability": piece["ability"]}
                    if (player["id"] == viewer_id or piece["placed"]) and piece.get("ability")
                    else {}
                ),
            }
            for piece in player["pieces"]
        ],
        "isOutOfMoves": player.get("isOutOfMoves", False),
        "settingsPlayerKey": player["settingsPlayerKey"],
        "isBot": player.get("isBot", False),
    }


def game_snapshot(game, viewer_id=None):
    current_player_id = None

    if game["status"] == "playing" and game["players"]:
        current_player_id = game["players"][game["currentTurnIndex"]]["id"]

    return {
        "gameId": game["gameId"],
        "revision": game.get("revision", 0),
        "inviteCode": game["gameId"],
        "settings": game["settings"],
        "lobbyMode": game.get("lobbyMode", False),
        "boardConfig": {
            "id": game["boardConfig"]["id"],
            "layout": game["boardConfig"]["layout"],
            "players": game["boardConfig"]["players"],
            "width": game["boardConfig"]["width"],
            "height": game["boardConfig"]["height"],
            "startPositions": [
                {"row": y, "col": x}
                for x, y in game["boardConfig"]["startPositions"]
            ],
        },
        "adminPlayerId": game["adminPlayerId"],
        "board": game["board"].get_grid(),
        "players": [public_player(player, viewer_id) for player in game["players"]],
        "currentPlayerId": current_player_id,
        "turnNumber": game["turnNumber"],
        "turnEndsAt": game["turnEndsAt"],
        "moveHistory": game["moveHistory"],
        "status": game["status"],
        "winnerId": game["winnerId"],
        "winnerIds": game.get("winnerIds", []),
        "leaderboard": game["leaderboard"],
        "availableColors": [
            option for option in PLAYER_COLORS
            if not any(
                player["color"] == option["color"]
                and (not game.get("lobbyMode") or not player.get("isBot"))
                for player in game["players"]
            )
        ],
        "notice": game["notice"],
    }


def get_game_or_404(game_id):
    game = games.get(game_id)

    if not game:
        raise HTTPException(status_code=404, detail="Game not found.")

    return game


def get_player(game, player_id):
    for player in game["players"]:
        if player["id"] == player_id:
            return player

    return None


def authenticate_player(game, player_id, player_token):
    player = get_player(game, player_id)

    if game.get("removedPlayers", {}).get(player_id) == player_token and player_token is not None:
        raise HTTPException(status_code=403, detail="You were removed from the room")

    if not player or player.get("isBot") or player["token"] != player_token:
        raise HTTPException(status_code=403, detail="Invalid player credentials.")

    return player


def choose_starting_player_index(player_count):
    return random.randrange(player_count)


def choose_start_positions(start_positions, player_count):
    return random.sample(start_positions, player_count)


def assign_start_positions(game):
    assigned_positions = choose_start_positions(
        game["boardConfig"]["startPositions"],
        len(game["players"]),
    )

    for player, (x, y) in zip(game["players"], assigned_positions):
        position = {"row": y, "col": x}
        player["startPosition"] = position
        # Keep the existing field available for older clients.
        player["corner"] = deepcopy(position)


def start_game_if_ready(game, manual=False):
    if game["hasStarted"]:
        return False

    if game.get("lobbyMode") and not manual:
        return False

    human_settings = [
        player_settings
        for player_settings in game["settings"]["players"].values()
        if not player_settings["isBot"]
    ]
    if any(player_settings["color"] is None for player_settings in human_settings):
        return False

    used_colors = {
        player_settings["color"]
        for player_settings in game["settings"]["players"].values()
        if player_settings["color"] is not None
    }
    available_colors = [
        color_option for color_option in PLAYER_COLORS
        if color_option["color"] not in used_colors
    ]
    random.shuffle(available_colors)
    runtime_players_by_key = {
        player["settingsPlayerKey"]: player
        for player in game["players"]
    }

    for player_key, player_settings in game["settings"]["players"].items():
        if not player_settings["isBot"]:
            continue

        runtime_player = runtime_players_by_key.get(player_key)
        if runtime_player and runtime_player["color"] is not None:
            continue

        color_option = available_colors.pop(0)
        player_settings["color"] = color_option["color"]
        if runtime_player:
            runtime_player.update(deepcopy(color_option))
            continue

        player_number = game["nextPlayerNumber"]
        game["nextPlayerNumber"] += 1
        game["players"].append(
            make_runtime_player(
                color_option,
                player_number,
                settings_player_key=player_key,
                is_bot=True,
            )
        )

    player_slot_order = {
        player_key: index
        for index, player_key in enumerate(game["settings"]["players"])
    }
    game["players"].sort(
        key=lambda player: player_slot_order[player["settingsPlayerKey"]]
    )
    assign_start_positions(game)
    game["currentTurnIndex"] = choose_starting_player_index(len(game["players"]))
    game["status"] = "playing"
    game["hasStarted"] = True
    first_player = game["players"][game["currentTurnIndex"]]
    game["notice"] = f'{first_player["name"]} goes first.'
    start_current_turn(game)
    return True


def validate_player_move(game, player, move):
    if game["status"] != "playing":
        return {
            "valid": False,
            "reason": "This game is not accepting moves.",
        }

    if player.get("isOutOfMoves"):
        return {
            "valid": False,
            "reason": "You are out of moves.",
        }

    current_player = game["players"][game["currentTurnIndex"]]

    if current_player["id"] != player["id"]:
        return {
            "valid": False,
            "reason": "It is not your turn.",
        }

    if game["turnEndsAt"] is not None and time.time() * 1000 >= game["turnEndsAt"]:
        return {
            "valid": False,
            "reason": "Your turn time has expired.",
        }

    piece = next(
        (piece for piece in player["pieces"] if piece["name"] == move.pieceName),
        None,
    )

    if not piece:
        return {
            "valid": False,
            "reason": "That piece does not belong to this player.",
        }

    if piece["placed"]:
        return {
            "valid": False,
            "reason": "That piece has already been placed.",
        }

    is_first_move = not any(piece["placed"] for piece in player["pieces"])
    start_position = player["startPosition"]
    reserved_positions = {
        (other_player["startPosition"]["row"], other_player["startPosition"]["col"])
        for other_player in game["players"]
        if (
            other_player["id"] != player["id"]
            and other_player["startPosition"] is not None
            and not any(piece["placed"] for piece in other_player["pieces"])
        )
    }

    return validate_move(
        board_grid=game["board"].get_grid(),
        cells=move.cells,
        is_first_move=is_first_move,
        player_id=player["id"],
        first_corner=(start_position["row"], start_position["col"]),
        reserved_positions=reserved_positions,
        ability=piece.get("ability"),
    )


def normalize_cells(cells):
    min_row = min(row for row, _ in cells)
    min_col = min(col for _, col in cells)
    return tuple(sorted((row - min_row, col - min_col) for row, col in cells))


def rotate_cells(cells, rotation):
    rotated = []

    for row, col in cells:
        if rotation == 90:
            rotated.append((-col, row))
        elif rotation == 180:
            rotated.append((-row, -col))
        elif rotation == 270:
            rotated.append((col, -row))
        else:
            rotated.append((row, col))

    return rotated


def piece_orientations(piece):
    orientations = []
    seen = set()

    for flipped in [False, True]:
        cells = [
            (row, -col if flipped else col)
            for row, col in piece["cells"]
        ]

        for rotation in [0, 90, 180, 270]:
            normalized = normalize_cells(rotate_cells(cells, rotation))
            if normalized not in seen:
                seen.add(normalized)
                orientations.append(normalized)

    return orientations


def player_block_count(player):
    return sum(
        len(piece["cells"])
        for piece in player["pieces"]
        if piece["placed"]
    )


def valid_placements_for_piece(game, player, piece):
    is_first_move = not any(piece["placed"] for piece in player["pieces"])
    start_position = player["startPosition"]
    board_grid = game["board"].get_grid()
    board_height = len(board_grid)
    board_width = len(board_grid[0]) if board_grid else 0
    reserved_positions = {
        (other_player["startPosition"]["row"], other_player["startPosition"]["col"])
        for other_player in game["players"]
        if (
            other_player["id"] != player["id"]
            and other_player["startPosition"] is not None
            and not any(piece["placed"] for piece in other_player["pieces"])
        )
    }

    for orientation in piece_orientations(piece):
        max_row = max(row for row, _ in orientation)
        max_col = max(col for _, col in orientation)

        for row_offset in range(board_height - max_row):
            for col_offset in range(board_width - max_col):
                cells = [
                    {
                        "row": row + row_offset,
                        "col": col + col_offset,
                    }
                    for row, col in orientation
                ]
                result = validate_move(
                    board_grid=board_grid,
                    cells=cells,
                    is_first_move=is_first_move,
                    player_id=player["id"],
                    first_corner=(start_position["row"], start_position["col"]),
                    reserved_positions=reserved_positions,
                    ability=piece.get("ability"),
                )

                if result["valid"]:
                    yield cells


def can_player_move(game, player):
    if game["status"] != "playing":
        return False

    for piece in player["pieces"]:
        if not piece["placed"] and next(
            valid_placements_for_piece(game, player, piece),
            None,
        ) is not None:
            return True

    return False


def choose_automatic_move(game, player, rng=random):
    available_pieces = [
        piece for piece in player["pieces"]
        if not piece["placed"]
    ]
    rng.shuffle(available_pieces)

    for piece in available_pieces:
        selected_cells = None
        placement_count = 0

        for cells in valid_placements_for_piece(game, player, piece):
            placement_count += 1
            if rng.randrange(placement_count) == 0:
                selected_cells = cells

        if selected_cells is not None:
            return {
                "pieceName": piece["name"],
                "cells": selected_cells,
            }

    return None


def choose_random_bot_move(game, player, rng=random):
    return choose_automatic_move(game, player, rng)


def make_leaderboard(game):
    leaderboard = [
        {
            "playerId": player["id"],
            "name": player["name"],
            "color": player["color"],
            "blocksPlaced": player_block_count(player),
        }
        for player in game["players"]
    ]
    leaderboard.sort(key=lambda entry: entry["blocksPlaced"], reverse=True)

    previous_score = None
    current_rank = 0
    for index, entry in enumerate(leaderboard):
        if entry["blocksPlaced"] != previous_score:
            current_rank = index + 1
            previous_score = entry["blocksPlaced"]
        entry["rank"] = current_rank

    return leaderboard


def finish_game(game):
    leaderboard = make_leaderboard(game)
    winning_score = leaderboard[0]["blocksPlaced"] if leaderboard else None
    winners = [
        entry for entry in leaderboard
        if entry["blocksPlaced"] == winning_score
    ]

    game["status"] = "finished"
    game["winnerId"] = winners[0]["playerId"] if len(winners) == 1 else None
    game["winnerIds"] = [winner["playerId"] for winner in winners]
    game["leaderboard"] = leaderboard
    game["currentTurnIndex"] = 0
    game["turnEndsAt"] = None
    if len(winners) == 1:
        winner = winners[0]
        game["notice"] = f'Game over. {winner["name"]} won with {winner["blocksPlaced"]} blocks.'
    elif winners:
        names = [winner["name"] for winner in winners]
        if len(names) == 2:
            winner_names = " and ".join(names)
        else:
            winner_names = f'{", ".join(names[:-1])}, and {names[-1]}'
        game["notice"] = f"Game over. Tie between {winner_names} with {winning_score} blocks."
    else:
        game["notice"] = "Game over."


def refresh_out_of_moves(game):
    newly_out = []

    if game["status"] != "playing":
        return newly_out

    for player in game["players"]:
        if player.get("isOutOfMoves"):
            continue

        if not can_player_move(game, player):
            player["isOutOfMoves"] = True
            newly_out.append(player)

    if newly_out:
        names = ", ".join(player["name"] for player in newly_out)
        game["notice"] = f"{names} ran out of moves. Their turns will be skipped."

    if game["players"] and all(player.get("isOutOfMoves") for player in game["players"]):
        finish_game(game)

    return newly_out


async def broadcast_game(game_id):
    game = games[game_id]
    game["revision"] = game.get("revision", 0) + 1
    sockets = list(connections.get(game_id, []))
    if not sockets:
        return

    stale_sockets = []
    for socket in sockets:
        try:
            game = games[game_id]
            viewer = get_player(game, socket.state.player_id)
            viewer_id = (
                viewer["id"]
                if viewer and not viewer.get("isBot")
                and viewer["token"] == socket.state.player_token
                else None
            )
            await socket.send_json({
                "type": "game_state",
                "game": game_snapshot(game, viewer_id),
            })
        except (RuntimeError, WebSocketDisconnect):
            stale_sockets.append(socket)

    for socket in stale_sockets:
        connections[game_id].discard(socket)


def advance_turn(game):
    if game["status"] != "playing" or not game["players"]:
        return

    for offset in range(1, len(game["players"]) + 1):
        next_index = (game["currentTurnIndex"] + offset) % len(game["players"])

        if not game["players"][next_index].get("isOutOfMoves"):
            game["currentTurnIndex"] = next_index
            start_current_turn(game)
            return


def start_current_turn(game):
    existing_task = turn_tasks.pop(game["gameId"], None)
    if existing_task and not existing_task.done():
        try:
            current_task = asyncio.current_task()
        except RuntimeError:
            current_task = None
        if existing_task is not current_task:
            existing_task.cancel()

    game["turnNumber"] += 1
    time_limit = game["settings"]["moveTimeLimitSeconds"]
    game["turnEndsAt"] = (
        time.time() * 1000 + time_limit * 1000
        if game["status"] == "playing" and time_limit is not None
        else None
    )


def apply_move(game, player, piece_name, cells, source="human"):
    game["board"].place_piece(
        cells,
        player=player["id"],
        color=player["color"],
        piece_id=f'{player["id"]}-{piece_name}',
    )

    piece = next(piece for piece in player["pieces"] if piece["name"] == piece_name)
    piece["placed"] = True
    game["moveHistory"].append({
        "playerId": player["id"],
        "pieceName": piece_name,
        "cells": cells,
        "source": source,
    })
    refresh_out_of_moves(game)
    advance_turn(game)


async def run_automatic_turn(
    game_id,
    expected_player_id,
    expected_turn_number,
    delay_seconds,
    source,
):
    current_task = asyncio.current_task()

    try:
        await asyncio.sleep(delay_seconds)
        game = games.get(game_id)

        if (
            not game
            or game["status"] != "playing"
            or not game["players"]
        ):
            return

        player = game["players"][game["currentTurnIndex"]]
        if (
            player["id"] != expected_player_id
            or game["turnNumber"] != expected_turn_number
            or (source == "bot" and not player.get("isBot"))
            or (source == "timeout" and player.get("isBot"))
        ):
            return

        move = choose_automatic_move(game, player)
        if move is None:
            player["isOutOfMoves"] = True
            game["notice"] = f'{player["name"]} ran out of moves.'
            refresh_out_of_moves(game)
            advance_turn(game)
        else:
            apply_move(game, player, move["pieceName"], move["cells"], source=source)
            if source == "timeout" and game["status"] == "playing":
                game["notice"] = (
                    f'{player["name"]} ran out of time. '
                    "A piece was placed automatically."
                )

        await broadcast_game(game_id)
    finally:
        if turn_tasks.get(game_id) is current_task:
            turn_tasks.pop(game_id, None)

    schedule_turn(game_id)


async def run_bot_turn(game_id, expected_player_id):
    game = games.get(game_id)
    if not game:
        return
    await run_automatic_turn(
        game_id,
        expected_player_id,
        game["turnNumber"],
        BOT_MOVE_DELAY_SECONDS,
        "bot",
    )


def schedule_turn(game_id):
    existing_task = turn_tasks.get(game_id)
    if existing_task and not existing_task.done():
        return

    game = games.get(game_id)
    if (
        not game
        or game["status"] != "playing"
        or not game["players"]
    ):
        return

    player = game["players"][game["currentTurnIndex"]]
    if player.get("isBot"):
        delay_seconds = BOT_MOVE_DELAY_SECONDS
        source = "bot"
    elif game["turnEndsAt"] is not None:
        delay_seconds = max(0, (game["turnEndsAt"] - time.time() * 1000) / 1000)
        source = "timeout"
    else:
        return

    turn_tasks[game_id] = asyncio.create_task(
        run_automatic_turn(
            game_id,
            player["id"],
            game["turnNumber"],
            delay_seconds,
            source,
        )
    )


def convert_player_to_bot(game, player):
    was_admin = game["adminPlayerId"] == player["id"]
    settings_player = game["settings"]["players"][player["settingsPlayerKey"]]
    settings_player["isBot"] = True
    player["isBot"] = True
    player["connected"] = True
    player["token"] = None

    remaining_humans = [
        joined_player
        for joined_player in game["players"]
        if not joined_player.get("isBot")
    ]

    if not remaining_humans:
        finish_game(game)
        game["adminPlayerId"] = None
        game["notice"] = (
            f'{player["name"]} left the game and became a bot. '
            "The game ended because no human players remain."
        )
        task = turn_tasks.pop(game["gameId"], None)
        if task and not task.done():
            task.cancel()
        return

    if was_admin:
        new_admin = min(
            remaining_humans,
            key=lambda joined_player: joined_player["joinedOrder"],
        )
        game["adminPlayerId"] = new_admin["id"]
        game["notice"] = (
            f'{player["name"]} left the game and became a bot. '
            f'{new_admin["name"]} is now the admin.'
        )
    else:
        game["notice"] = f'{player["name"]} left the game and became a bot.'


@app.post("/games")
def create_game(request: CreateGameRequest | None = None):
    game_id = f"{secrets.randbelow(1_000_000):06d}"
    while game_id in games:
        game_id = f"{secrets.randbelow(1_000_000):06d}"
    settings = request.settings if request else GameSettingsRequest()
    games[game_id] = create_game_state(game_id, settings)
    connections[game_id] = set()
    return {
        **game_snapshot(games[game_id]),
        "adminToken": games[game_id]["adminToken"],
    }


@app.get("/games/{game_id}")
def get_game_state(
    game_id: str,
    x_player_id: str | None = Header(default=None),
    x_player_token: str | None = Header(default=None),
):
    game = get_game_or_404(game_id)
    viewer_id = None
    if x_player_id is not None or x_player_token is not None:
        viewer_id = authenticate_player(game, x_player_id, x_player_token)["id"]
    return game_snapshot(game, viewer_id)


@app.post("/games/{game_id}/join")
async def join_game(game_id: str, request: JoinRequest):
    game = get_game_or_404(game_id)

    if game.get("lobbyMode") and len(game["players"]) >= MAX_PLAYERS:
        raise HTTPException(status_code=409, detail="Room is full")

    if game.get("lobbyMode") and game["status"] != "waiting":
        raise HTTPException(status_code=409, detail="This room is no longer accepting players.")

    player_name = request.name.strip() if request.name is not None else None
    if request.name is not None and not player_name:
        raise HTTPException(status_code=400, detail="Enter a game name.")

    if request.adminToken:
        if request.adminToken != game["adminToken"]:
            raise HTTPException(status_code=403, detail="Invalid admin credentials.")
        if game["adminPlayerId"] is not None:
            raise HTTPException(status_code=409, detail="This game already has an admin.")

    if game.get("lobbyMode") and game["adminPlayerId"] is None and not request.adminToken:
        raise HTTPException(status_code=409, detail="The host is still joining this room.")

    player_count = game["settings"]["playerCount"]
    if not game.get("lobbyMode") and len(game["players"]) >= player_count:
        raise HTTPException(
            status_code=409,
            detail=f"This game already has {player_count} players.",
        )

    requested_color = request.color
    if game.get("lobbyMode") and requested_color is None:
        requested_color = next(
            color for color in LOBBY_COLOR_ORDER
            if not any(
                player["color"] == color and not player.get("isBot")
                for player in game["players"]
            )
        )
    color_option = next(
        (
            deepcopy(option)
            for option in PLAYER_COLORS
            if requested_color and option["color"].lower() == requested_color.lower()
        ),
        None,
    )
    if not color_option:
        raise HTTPException(status_code=400, detail="Choose one of the available colors.")
    if any(
        player["color"] == color_option["color"]
        and (not game.get("lobbyMode") or not player.get("isBot"))
        for player in game["players"]
    ):
        raise HTTPException(status_code=409, detail="That color has already been chosen.")

    player_number = game["nextPlayerNumber"]
    game["nextPlayerNumber"] += 1
    if game.get("lobbyMode"):
        settings_player_key = f"Player {player_number}"
    else:
        settings_player_key = next(
            (
                player_key
                for player_key, player_settings in game["settings"]["players"].items()
                if not player_settings["isBot"] and player_settings["color"] is None
            ),
            None,
        )
        if settings_player_key is None:
            raise HTTPException(status_code=409, detail="All human player slots are filled.")

    player = make_runtime_player(
        color_option,
        player_number,
        settings_player_key=settings_player_key,
        player_name=player_name or (f"Player {player_number}" if game.get("lobbyMode") else None),
    )
    game["players"].append(player)
    if game.get("lobbyMode"):
        reassign_bots_for_human_color(game, player)
    else:
        game["settings"]["players"][player["settingsPlayerKey"]]["color"] = player["color"]

    if request.adminToken:
        game["adminPlayerId"] = player["id"]

    start_game_if_ready(game)

    await broadcast_game(game_id)
    schedule_turn(game_id)

    return {
        "playerId": player["id"],
        "playerToken": player["token"],
        "color": player["color"],
        "name": player["name"],
    }


def require_waiting_lobby(game):
    if not game.get("lobbyMode") or game["status"] != "waiting":
        raise HTTPException(status_code=409, detail="This room is not in the lobby.")


def authenticate_lobby_host(game, request):
    player = authenticate_player(game, request.playerId, request.playerToken)
    require_waiting_lobby(game)
    if player["id"] != game["adminPlayerId"]:
        raise HTTPException(status_code=403, detail="Only the host can change settings or start the game.")
    return player


def first_free_lobby_color(game, excluded_player_id=None):
    used_colors = {
        player["color"]
        for player in game["players"]
        if player["id"] != excluded_player_id and player["color"] is not None
    }
    return next(color for color in LOBBY_COLOR_ORDER if color not in used_colors)


def reassign_bots_for_human_color(game, human):
    for bot in game["players"]:
        if bot["id"] == human["id"] or not bot.get("isBot") or bot["color"] != human["color"]:
            continue
        bot["color"] = first_free_lobby_color(game, excluded_player_id=bot["id"])


def first_free_lobby_bot_number(game):
    used_names = {
        player["name"]
        for player in game["players"]
        if player.get("isBot")
    }
    number = 1
    while f"Bot {number}" in used_names:
        number += 1
    return number


def make_lobby_bot(game):
    color = first_free_lobby_color(game)
    bot_number = first_free_lobby_bot_number(game)
    bot = make_runtime_player(
        {"color": color},
        game["nextPlayerNumber"],
        settings_player_key=f'Player {game["nextPlayerNumber"]}',
        is_bot=True,
        player_name=f"Bot {bot_number}",
    )
    game["nextPlayerNumber"] += 1
    game["players"].append(bot)


@app.post("/games/{game_id}/bots")
async def add_lobby_bot(game_id: str, request: QuitRequest):
    game = get_game_or_404(game_id)
    host = authenticate_lobby_host(game, request)
    if len(game["players"]) >= MAX_PLAYERS:
        raise HTTPException(status_code=409, detail="Room is full")
    make_lobby_bot(game)
    await broadcast_game(game_id)
    return game_snapshot(game, host["id"])


@app.post("/games/{game_id}/remove-player")
async def remove_lobby_player(game_id: str, request: RemoveLobbyPlayerRequest):
    game = get_game_or_404(game_id)
    host = authenticate_lobby_host(game, request)
    if request.targetPlayerId == host["id"]:
        raise HTTPException(status_code=409, detail="The host cannot remove their own seat.")
    player = get_player(game, request.targetPlayerId)
    if player is None:
        raise HTTPException(status_code=404, detail="Player not found in this room.")
    if not player.get("isBot"):
        game["removedPlayers"][player["id"]] = player["token"]
    game["players"].remove(player)
    player["token"] = None
    for socket in list(connections.get(game_id, [])):
        if socket.state.player_id != player["id"]:
            continue
        connections[game_id].discard(socket)
        try:
            await socket.send_json({"type": "room_removed", "message": "You were removed from the room"})
            await socket.close(code=1008, reason="You were removed from the room")
        except (RuntimeError, WebSocketDisconnect):
            pass
    await broadcast_game(game_id)
    return game_snapshot(game, host["id"])


@app.patch("/games/{game_id}/profile")
async def update_lobby_profile(game_id: str, request: LobbyProfileRequest):
    game = get_game_or_404(game_id)
    player = authenticate_player(game, request.playerId, request.playerToken)
    require_waiting_lobby(game)
    name = request.name.strip() if request.name is not None else player["name"]
    if not name:
        raise HTTPException(status_code=422, detail="Enter your name.")
    color = player["color"]
    if request.color is not None:
        option = next((option for option in PLAYER_COLORS if option["color"].lower() == request.color.lower()), None)
        if not option:
            raise HTTPException(status_code=422, detail="Choose one of the available colours.")
        color = option["color"]
        if any(
            other["id"] != player["id"] and not other.get("isBot") and other["color"] == color
            for other in game["players"]
        ):
            raise HTTPException(status_code=409, detail="That colour has already been chosen.")
    player["name"] = name
    player["color"] = color
    reassign_bots_for_human_color(game, player)
    await broadcast_game(game_id)
    return game_snapshot(game, player["id"])


@app.patch("/games/{game_id}/settings")
async def update_lobby_settings(game_id: str, request: LobbySettingsRequest):
    game = get_game_or_404(game_id)
    host = authenticate_lobby_host(game, request)
    validated = normalize_game_settings(GameSettingsRequest(
        boardLayout=request.boardLayout,
        playerCount=max(MIN_PLAYERS, len(game["players"])),
        moveTimeLimitSeconds=request.moveTimeLimitSeconds,
        lobbyMode=True,
    ))
    game["settings"]["boardLayout"] = validated["boardLayout"]
    game["settings"]["moveTimeLimitSeconds"] = validated["moveTimeLimitSeconds"]
    preview_count = max(MIN_PLAYERS, len(game["players"]))
    config = get_board_config(validated["boardLayout"], preview_count)
    game["boardConfig"] = config
    game["board"] = Board(config)
    await broadcast_game(game_id)
    return game_snapshot(game, host["id"])


@app.post("/games/{game_id}/start")
async def start_lobby_game(game_id: str, request: QuitRequest):
    game = get_game_or_404(game_id)
    host = authenticate_lobby_host(game, request)
    player_count = len(game["players"])
    if player_count not in SUPPORTED_PLAYER_COUNTS:
        raise HTTPException(status_code=409, detail="At least two players are required to start.")
    game["settings"]["playerCount"] = player_count
    game["settings"]["players"] = {}
    for index, player in enumerate(game["players"], start=1):
        player_key = f"Player {index}"
        player["settingsPlayerKey"] = player_key
        game["settings"]["players"][player_key] = {
            "color": player["color"],
            "isBot": player.get("isBot", False),
        }
    config = get_board_config(game["settings"]["boardLayout"], player_count)
    game["boardConfig"] = config
    game["board"] = Board(config)
    start_game_if_ready(game, manual=True)
    await broadcast_game(game_id)
    schedule_turn(game_id)
    return game_snapshot(game, host["id"])


@app.post("/games/{game_id}/leave-room")
async def leave_lobby(game_id: str, request: QuitRequest):
    game = get_game_or_404(game_id)
    player = authenticate_player(game, request.playerId, request.playerToken)
    require_waiting_lobby(game)
    game["players"].remove(player)
    player["token"] = None
    if game["adminPlayerId"] == player["id"]:
        remaining_humans = [remaining for remaining in game["players"] if not remaining.get("isBot")]
        game["adminPlayerId"] = min(remaining_humans, key=lambda player: player["joinedOrder"])["id"] if remaining_humans else None
        game["adminToken"] = secrets.token_urlsafe(24)
        if not remaining_humans:
            game["players"].clear()
    if not game["players"]:
        game["status"] = "closed"
    await broadcast_game(game_id)
    return {"success": True}


@app.post("/games/{game_id}/quit")
async def quit_game(game_id: str, request: QuitRequest):
    game = get_game_or_404(game_id)
    if game.get("lobbyMode") and game["status"] == "waiting":
        return await leave_lobby(game_id, request)
    player = authenticate_player(game, request.playerId, request.playerToken)
    convert_player_to_bot(game, player)
    await broadcast_game(game_id)
    schedule_turn(game_id)
    return {"success": True}


@app.post("/games/{game_id}/restart")
async def restart_game(game_id: str, request: RestartRequest):
    game = get_game_or_404(game_id)
    player = authenticate_player(game, request.playerId, request.playerToken)

    if game["status"] != "finished":
        raise HTTPException(status_code=409, detail="Only finished games can be restarted.")

    winner_id = game["winnerId"] or next(iter(game.get("winnerIds", [])), None)
    game["board"] = Board(game["boardConfig"])
    game["moveHistory"] = []
    game["status"] = "playing"
    game["hasStarted"] = True
    game["winnerId"] = None
    game["winnerIds"] = []
    game["leaderboard"] = []

    for joined_player in game["players"]:
        joined_player["pieces"] = make_piece_set()
        joined_player["isOutOfMoves"] = False

    assign_start_positions(game)

    game["currentTurnIndex"] = next(
        (index for index, joined_player in enumerate(game["players"]) if joined_player["id"] == winner_id),
        game["players"].index(player),
    )
    first_player = game["players"][game["currentTurnIndex"]]
    game["notice"] = f'New game started. {first_player["name"]} goes first.'
    start_current_turn(game)

    await broadcast_game(game_id)
    schedule_turn(game_id)

    return game_snapshot(game, player["id"])


@app.post("/games/{game_id}/validate-move")
def validate_move_endpoint(game_id: str, move: MoveRequest):
    game = get_game_or_404(game_id)
    player = authenticate_player(game, move.playerId, move.playerToken)

    return validate_player_move(game, player, move)


@app.websocket("/games/{game_id}/ws")
async def game_websocket(websocket: WebSocket, game_id: str, playerId: str, token: str):
    game = games.get(game_id)

    if not game:
        await websocket.close(code=1008)
        return

    player = get_player(game, playerId)

    if game.get("removedPlayers", {}).get(playerId) == token:
        await websocket.close(code=1008, reason="You were removed from the room")
        return

    if not player or player.get("isBot") or player["token"] != token:
        await websocket.close(code=1008)
        return

    websocket.state.player_id = playerId
    websocket.state.player_token = token
    await websocket.accept()
    connections.setdefault(game_id, set()).add(websocket)
    player["connected"] = True
    await broadcast_game(game_id)

    try:
        while True:
            message = await websocket.receive_json()
            if player not in game["players"] or player.get("isBot") or player["token"] != token:
                await websocket.close(code=1008)
                break
            action = message.get("type")

            if action == "request_state":
                await websocket.send_json({
                    "type": "game_state",
                    "game": game_snapshot(game, playerId),
                })

            if action == "place_piece":
                move = MoveRequest(
                    cells=message.get("cells", []),
                    pieceName=message.get("pieceName", ""),
                    playerId=playerId,
                    playerToken=token,
                )
                result = validate_player_move(game, player, move)

                if not result["valid"]:
                    await websocket.send_json({
                        "type": "error",
                        "reason": result["reason"],
                    })
                    continue

                apply_move(game, player, move.pieceName, move.cells)
                await broadcast_game(game_id)
                schedule_turn(game_id)

    except WebSocketDisconnect:
        pass
    except RuntimeError:
        # A host can close this socket while its receive loop is still running.
        if websocket.application_state != WebSocketState.DISCONNECTED:
            raise
    finally:
        connections[game_id].discard(websocket)
        if player in game["players"] and not player.get("isBot"):
            player["connected"] = False
        await broadcast_game(game_id)
