import { useEffect, useState } from 'react'
import { getPlayerColorHex } from '../../../game/playerColors'

function secondsUntil(timestamp) {
	return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000))
}

function TurnTimer({ endsAt, limit }) {
	const [remaining, setRemaining] = useState(() => secondsUntil(endsAt))
	useEffect(() => {
		const interval = setInterval(() => setRemaining(secondsUntil(endsAt)), 250)
		return () => clearInterval(interval)
	}, [endsAt])
	const fraction = limit ? Math.min(1, remaining / limit) : 0
	return (
		<>
			<span className="turnTimerTrack" aria-hidden="true"><span style={{ width: `${fraction * 100}%` }} /></span>
			<span className="turnTimer">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span>
		</>
	)
}

function TurnBanner({ canMove, game, isRestarting, isTie, onRestart, resultColor, winner }) {
	const finished = game?.status === 'finished'
	const currentPlayer = game?.players.find(player => player.id === game.currentPlayerId)
	const turnColor = finished ? resultColor : getPlayerColorHex(currentPlayer?.color)
	return (
		<div className="turnBanner" style={{ '--turn-color': turnColor }} role="status">
			<span className="turnTitle">
				{finished ? isTie ? "It's a tie!" : `${winner?.name || 'A player'} won!`
					: game?.status === 'waiting' ? 'Waiting for players'
						: canMove ? 'Your turn' : `${currentPlayer?.name || 'Player'}'s turn`}
			</span>
			{!finished && game?.turnEndsAt != null && <TurnTimer key={game.turnNumber} endsAt={game.turnEndsAt} limit={game.settings.moveTimeLimitSeconds} />}
			{finished && <button type="button" className="restartButton" onClick={onRestart} disabled={isRestarting}>{isRestarting ? 'Starting…' : 'New game'}</button>}
		</div>
	)
}

export default TurnBanner
