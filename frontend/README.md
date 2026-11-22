# Tipto

Tipto is a polyomino tile placement game for 2–6 players. Take turns placing pieces on a shared board and try to cover as many squares as you can with your 16 pieces.

Choose from three board styles, play with friends or fill empty seats with bots, and join from a phone or desktop browser.

**[Click Here to Play](https://tipto.vercel.app/)**

## Tipto in Action

![A Tipto game in progress, showing the board and remaining pieces](public/tipto-mid-game.png)

## How to play

On your turn, choose one of your remaining pieces and rotate or flip it to fit. Your first piece must cover your marked starting square. After that, a regular piece must touch one of your own pieces at a corner without sharing an edge with any of them. Every piece must fit on playable squares without overlapping another piece.

Two special pieces change how you can connect:
- Scout: You can place it without a corner connection, but it still can’t share an edge with your own pieces.
- Connector: You can connect it to one of your own pieces along an edge or at a corner.

The game ends when nobody has a legal move left. Your score is the number of squares you covered, so a larger piece earns more points than a smaller one. The highest score wins.

## Run locally

The commands below use Windows PowerShell.

### Prerequisites

- Node.js 24 with npm, which comes with Node.js.
- Python 3 with `pip` and `venv`. The backend has been tested with Python 3.14.

### First-time setup

If the dependencies are already installed, skip to [Start Tipto](#start-tipto).

Set up the backend from the repository root:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

In a separate terminal, install the frontend dependencies from the repository root:

```powershell
cd frontend
npm ci
```

### Start Tipto

Start the backend from the repository root:

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

In a second terminal, start the frontend from the repository root:

```powershell
cd frontend
npm run dev -- --host
```

On the computer running Tipto, open the **Local** URL printed by Vite. It’s usually [http://localhost:5173](http://localhost:5173).

### Run Locally on the Phone

1. Connect your phone and computer to the same Wi-Fi network.
2. Find your computer's local IPv4 address. On Windows, run `ipconfig` and look under your active Wi-Fi or Ethernet adapter.
3. Set these two lines in `frontend/.env.local`, replacing `192.168.1.42` with your computer's address. Restart Vite if it's already running.

   ```dotenv
   VITE_API_BASE=http://192.168.1.42:8000
   VITE_WS_BASE=ws://192.168.1.42:8000
   ```

4. With both servers running, open the **Network** URL printed by Vite on your phone. Use the URL that matches your computer's Wi-Fi or Ethernet address.

### Run tests

Run `npm test` from `frontend/` to run the frontend tests.

## Architecture

- **Frontend:** React and Vite in `frontend/`.
- **Backend:** FastAPI in `backend/`.

<!-- Explain where game state lives, how moves are validated, and how WebSocket updates reach players. -->
