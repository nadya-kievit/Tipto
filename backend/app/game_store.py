import hashlib
import hmac
import logging
from contextlib import contextmanager
from datetime import UTC, datetime

from app.game.board import Board
from app.game.board_layouts import get_board_config


logger = logging.getLogger(__name__)


def token_digest(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def saved_token_digest(state, key):
    token = state.get(key)
    return token_digest(token) if token is not None else state.get(f"{key}Hash")


def matches_digest(digest, token):
    return bool(digest and token and hmac.compare_digest(digest, token_digest(token)))


def token_matches(state, key, token):
    return matches_digest(saved_token_digest(state, key), token)


class GameDatabaseUnavailable(Exception):
    pass


class GameWriteConflict(Exception):
    pass


class PostgresGameStore:
    def __init__(self, database_url):
        from psycopg import Error
        from psycopg.rows import dict_row
        from psycopg.types.json import Jsonb
        from psycopg_pool import ConnectionPool

        self._error = Error
        self._json = Jsonb
        # Use the sync driver in a worker thread so Windows can keep its default event loop.
        self._pool = ConnectionPool(
            database_url,
            kwargs={"row_factory": dict_row, "connect_timeout": 5},
            min_size=1,
            max_size=4,
            timeout=5,
            open=False,
        )

    def open(self):
        self._pool.open(wait=True, timeout=10)

    def close(self):
        self._pool.close()

    @contextmanager
    def _connection(self):
        try:
            with self._pool.connection() as connection:
                yield connection
        except self._error as error:
            logger.warning("Game database operation failed (%s)", type(error).__name__)
            raise GameDatabaseUnavailable from None

    def _game_state(self, game):
        state = {
            key: value for key, value in game.items()
            if key not in {
                "gameId", "status", "revision", "turnEndsAt", "adminToken", "adminTokenHash",
                "board", "boardConfig", "players",
            }
        }
        state["boardConfig"] = game["boardConfig"]
        if game["hasStarted"]:
            state["board"] = game["board"].get_grid()
        return self._json(state)

    def create(self, game):
        with self._connection() as connection:
            inserted = connection.execute(
                """
                insert into tipto.games (id, status, revision, admin_token_hash, state)
                values (%s, 'waiting', %s, %s, %s)
                on conflict (id) do nothing
                returning id
                """,
                (game["gameId"], game["revision"], saved_token_digest(game, "adminToken"),
                 self._game_state(game)),
            )
            return inserted.fetchone() is not None

    def save(self, game, expected_revision):
        deadline = game["turnEndsAt"]
        turn_ends_at = datetime.fromtimestamp(deadline / 1000, UTC) if deadline is not None else None
        with self._connection() as connection:
            updated = connection.execute(
                """
                update tipto.games
                set status = %s, revision = %s, turn_ends_at = %s, admin_token_hash = %s, state = %s
                where id = %s and revision = %s
                """,
                (game["status"], game["revision"], turn_ends_at, saved_token_digest(game, "adminToken"),
                 self._game_state(game), game["gameId"], expected_revision),
            )
            if updated.rowcount != 1:
                raise GameWriteConflict

            # Each room has at most six seats. Replacing them also handles seat reordering.
            connection.execute("delete from tipto.players where game_id = %s", (game["gameId"],))
            with connection.cursor() as cursor:
                cursor.executemany(
                    """
                    insert into tipto.players (
                        game_id, player_id, seat_order, display_name, color, is_bot,
                        player_token_hash, state
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    [
                        (
                            game["gameId"], player["id"], seat, player["name"], player["color"],
                            player["isBot"], saved_token_digest(player, "token"),
                            self._json({
                                key: value for key, value in player.items()
                                if key not in {
                                    "id", "name", "color", "isBot", "token", "tokenHash", "connected",
                                }
                            }),
                        )
                        for seat, player in enumerate(game["players"])
                    ],
                )

    def delete(self, game_id, expected_revision):
        with self._connection() as connection:
            deleted = connection.execute(
                "delete from tipto.games where id = %s and revision = %s",
                (game_id, expected_revision),
            )
            if deleted.rowcount != 1:
                raise GameWriteConflict

    def load_games(self):
        with self._connection() as connection:
            rows = connection.execute(
                """
                select g.id, g.status, g.revision, g.turn_ends_at, g.admin_token_hash, g.state as game_state,
                       p.player_id, p.display_name, p.color, p.is_bot, p.player_token_hash,
                       p.state as player_state
                from tipto.games g
                left join tipto.players p on p.game_id = g.id
                order by g.id, p.seat_order
                """
            ).fetchall()

        games = {}
        for row in rows:
            game_id = row["id"]
            if game_id not in games:
                state = row["game_state"]
                config = state.pop("boardConfig")
                if "cells" in config:
                    # The saved layout stays with the match even if board presets change.
                    config["cells"] = [tuple(cell) for cell in config["cells"]]
                    config["startPositions"] = [tuple(position) for position in config["startPositions"]]
                else:
                    # Lobbies saved before match persistence only recorded the preset.
                    config = get_board_config(config["layout"], config["players"])
                board = Board(config)
                if "board" in state:
                    board.grid = state.pop("board")
                deadline = row["turn_ends_at"]
                games[game_id] = {
                    **state,
                    "gameId": game_id,
                    "revision": row["revision"],
                    "adminTokenHash": row["admin_token_hash"],
                    "status": row["status"],
                    "turnEndsAt": deadline.timestamp() * 1000 if deadline is not None else None,
                    "boardConfig": config,
                    "board": board,
                    "players": [],
                }
            if row["player_id"] is not None:
                games[game_id]["players"].append({
                    **row["player_state"],
                    "id": row["player_id"],
                    "name": row["display_name"],
                    "color": row["color"],
                    "isBot": row["is_bot"],
                    "tokenHash": row["player_token_hash"],
                    "connected": row["is_bot"],
                })
        return games
