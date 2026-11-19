import useTurnTimer from '../../../hooks/useTurnTimer'
import { getPlayerColorHex } from '../../../game/playerColors'

function TurnBanner({ canMove, game, isRestarting, isTie, onRestart, resultColor, winner }) {
	const finished = game?.status === 'finished'
	const timer = useTurnTimer(finished ? null : game?.turnEndsAt, game?.settings?.moveTimeLimitSeconds)
	const currentPlayer = game?.players.find(player => player.id === game.currentPlayerId)
	const turnColor = finished ? resultColor : getPlayerColorHex(currentPlayer?.color)

	return (
		<div className="turnBanner" style={{ '--turn-color': turnColor }} role="status">
			<span className="turnTitle">
				{finished
					? isTie
						? "It's a tie!"
						: `${winner?.name || 'A player'} won!`
					: canMove
						? 'Your turn'
						: `${currentPlayer?.name || 'Player'}'s turn`
				}
			</span>

			{!finished && game?.turnEndsAt != null &&
				<>
					<span className="turnTimerTrack">
						<span style={{ width: `${timer.fraction * 100}%` }} />
					</span>
					<span className="turnTimer">{timer.text}</span>
				</>
			}

			{finished &&
				<button
					type="button"
					className="restartButton"
					onClick={onRestart}
					disabled={isRestarting}
				>
					{isRestarting ? 'Starting…' : 'New game'}
				</button>
			}
		</div>
	)
}

export default TurnBanner
