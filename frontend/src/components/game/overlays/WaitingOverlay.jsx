import { useMemo } from 'react'
import clsx from 'clsx'
import { PLAYER_COLORS, getPlayerColorHex } from '../../../game/playerColors'

function WaitingOverlay({ game }) {
	const readySlots = useMemo(() => {
		const configuredPlayers = Object.entries(game?.settings?.players || {})
			.filter(([, player]) => !player.isBot)

		if (!configuredPlayers.length) {
			return PLAYER_COLORS.slice(0, 4).map(seat => ({
				key: seat.name,
				color: game?.players.some(player => player.color === seat.name)
					? seat.hex
					: null,
			}))
		}

		return configuredPlayers.map(([key, player]) => ({
			key,
			color: getPlayerColorHex(player.color, null),
		}))
	}, [game])

	const readyCount = game?.players.length || 0
	const requiredPlayers = readySlots.length
	const circumference = 2 * Math.PI * 90
	const gap = 10
	const segmentLength = circumference / requiredPlayers - gap

	return (
		<div className="waitingOverlay" role="status" aria-live="polite">
			<div className="readyDial">
				<svg
					className="readyRingSvg"
					viewBox="0 0 220 220"
					aria-hidden="true"
				>
					{readySlots.map((slot, index) => {
						const rotation = -90 + index * (360 / requiredPlayers)

						return (
							<circle
								key={slot.key}
								cx="110"
								cy="110"
								r="90"
								className="readyArc"
								strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
								transform={`rotate(${rotation} 110 110)`}
								style={{ '--seat-color': slot.color || 'var(--border-strong)' }}
							/>
						)
					})}

					{readySlots.map((slot, index) => {
						const angle = (
							-90 + (index + 0.5) * (360 / requiredPlayers)
						) * Math.PI / 180

						return (
							<circle
								key={`${slot.key}-dot`}
								cx={110 + 90 * Math.cos(angle)}
								cy={110 + 90 * Math.sin(angle)}
								r="12"
								className={clsx('readySeatDot', {
									readySeatDotFilled: Boolean(slot.color),
								})}
								style={{ '--seat-color': slot.color || 'var(--border-strong)' }}
							/>
						)
					})}
				</svg>

				<div className="readyContent">
					<div className="readyCount">
						{readyCount} of {requiredPlayers}
					</div>

					<div className="readyLabel">players ready</div>

					<div className="readyMessage">
						Waiting for more
						<br />
						players...
					</div>
				</div>
			</div>
		</div>
	)
}

export default WaitingOverlay
