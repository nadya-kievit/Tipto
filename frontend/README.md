## What is Tipto?

## How to Play

## How to Run

# Architecture

Frontend source lives in `src/`:

- `app/`: the app entry component and browser navigation.
- `screens/`: the Home, Lobby, and Game screens, which coordinate data and state.
- `components/background/`: animated backgrounds and their calculation helpers.
- `components/lobby/`: the board preview, player row, and timer dial.
- `components/game/`: game UI grouped into `board/`, `pieces/`, `layout/`, `players/`, and `overlays/`.
- `game/`: placement rules, piece presentation, and player colours.
- `hooks/`: shared React hooks for viewport detection and sizing.
- `services/`: backend API access and room sessions.
- `styles/`: all CSS, with game styles grouped under `styles/game/`.

Keep screen-specific components with their feature and place new CSS under `styles/`.
`styles/legacy.css` is the existing shared stylesheet, preserved during reorganization.
Its overlapping rules should be audited separately before removing or redistributing them.
CSS imports remain in their original relative order to preserve the cascade.

Tests stay in `tests/`, static assets in `public/`, and development scripts in `scripts/`.

# Run the Frontend
cd frontend
npm run dev -- --host

# Run the Backend
cd backend
.\venv\Scripts\Activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
