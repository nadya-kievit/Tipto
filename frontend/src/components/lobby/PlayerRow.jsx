import { getPlayerColorHex } from '../../game/playerColors'

function RobotIcon() {
	return (
		<svg viewBox="0 0 24 24">
			<path d="M12 7V4M10 2h4" />
			<rect x="4" y="7" width="16" height="13" rx="3" />
			<path d="M4 11H2v5h2M20 11h2v5h-2M9 17h6" />
			<circle className="robotEye" cx="9" cy="13" r="1.25" />
			<circle className="robotEye" cx="15" cy="13" r="1.25" />
		</svg>
	)
}

function PlayerRow({
	player,
	isYou,
	isHost,
	colorOptions,
	name,
	onNameChange,
	onNameBlur,
	onColour,
	onRemove
}) {
	const handleRemove = () => {
		onRemove(player.id)
	}

	return (
		<div className={`lobbyPlayerRow${isYou ? ' own' : ''}`} style={{
			'--player-colour': getPlayerColorHex(player.color)
		}}>
			<span className={`lobbyPlayerTile${player.isBot ? ' bot' : ''}`}>
				{player.isBot && <RobotIcon />}
			</span>
			{isYou ? <div className="lobbyOwnProfile">
				<input
					value={name}
					maxLength={24}
					onChange={onNameChange}
					onBlur={onNameBlur}
					autoComplete="nickname"
				/>
				<div
					className="lobbySwatches"
					role="group"
				>
					{colorOptions.map(option => (
							<button
								key={option.name}
								type="button"
								className="lobbySwatch"
								style={{
									'--swatch': option.hex
								}}
								disabled={option.takenBy !== null}
								data-taken={option.takenBy !== null ? '' : undefined}
								data-selected={player.color === option.name}
								title={option.takenBy !== null ? `Taken by ${option.takenBy}` : option.name}
								onClick={() => onColour(option.name)}
							>
							</button>
					))}
				</div>
			</div> : <span className="lobbyPlayerName" title={player.name}>
				{player.name}
			</span>}
			{player.isBot && isHost && <button
				type="button"
				className="lobbyRemoveBot"
				onClick={handleRemove}
			>{'\u00d7'}</button>}
		</div>
	)
}

export default PlayerRow
