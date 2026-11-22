## What is Tipto?

## How to Play

## How to Run

# Architecture

Frontend source lives in `src/`:

- `app/`: the app entry component, browser navigation, and pregame background.
- `screens/`: Home, Lobby, and Game UI and their styles. The lobby and game share the header.
- `services/`: backend API access and the clipboard helper.
- `styles/`: document-wide defaults in `global.css`.

Keep screen-specific CSS beside its screen. Game styles are grouped under `screens/game/styles/`.

Tests stay in `tests/`, static assets in `public/`, and development scripts in `scripts/`.

# Run the Frontend
cd frontend
npm run dev -- --host

# Run the Backend
cd backend
.\venv\Scripts\Activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000


src
- app
- components
- game
- hooks
- screens
- services
- styles

src/
├── main.jsx
├── app/
├── screens/
│   ├── home/
│   ├── lobby/
│   └── game/
├── components/
├── styles/
├── gameApi.js
├── clipboard.js
└── playerColors.js  
