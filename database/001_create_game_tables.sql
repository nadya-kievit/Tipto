begin;

create schema tipto;
revoke all on schema tipto from public;

create table tipto.games (
    id text primary key,
    status text not null default 'waiting'
        check (status in ('waiting', 'playing', 'finished')),
    revision integer not null default 0 check (revision >= 0),
    turn_ends_at timestamptz,
    admin_token_hash text not null,
    state jsonb not null check (jsonb_typeof(state) = 'object')
);

comment on table tipto.games is
    'One row per room. A rematch updates the room with the new match state.';
comment on column tipto.games.turn_ends_at is
    'Current turn deadline. NULL if there is no timer running.';
comment on column tipto.games.state is
    'Game snapshot, including board, settings, current seat, turn number, move history, and results.';

create table tipto.players (
    game_id text not null references tipto.games (id) on delete cascade,
    player_id text not null,
    seat_order integer not null check (seat_order >= 0),
    display_name text not null,
    color text not null,
    is_bot boolean not null default false,
    player_token_hash text,
    state jsonb not null check (jsonb_typeof(state) = 'object'),
    primary key (game_id, player_id),
    unique (game_id, seat_order)
);

comment on table tipto.players is
    'One row per seat in a game, including guest players and bots.';
comment on column tipto.players.state is
    'Starting square, piece inventory and abilities, and other saved state for this seat.';

-- Browser roles have no policies or grants to access saved game state.
alter table tipto.games enable row level security;
alter table tipto.players enable row level security;

commit;
