import { getPlayerColorHex, PLAYER_COLORS } from '../../game/playerColors'

function RobotIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
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
	players,
	name,
	busy,
	managingPlayers,
	savingProfile,
	onNameChange,
	onNameBlur,
	onColour,
	onRemove
}) {
	return (
		<div className={`lobbyPlayerRow${isYou ? ' own' : ''}`} style={{
			'--player-colour': getPlayerColorHex(player.color)
		}}>
			<span className={`lobbyPlayerTile${player.isBot ? ' bot' : ''}`} aria-hidden="true">
				{player.isBot && <RobotIcon />}
			</span>
			{isYou ? <div className="lobbyOwnProfile">
				<input
					aria-label="Name"
					value={name}
					maxLength={24}
					onChange={onNameChange}
					onBlur={onNameBlur}
					disabled={busy}
					data-managing-players={managingPlayers || undefined}
					autoComplete="nickname"
				/>
				<div
					className="lobbySwatches"
					role="group"
					aria-label="Colour"
				>
					{PLAYER_COLORS.map(option => {
						const takenBy = players.find(other => other.id !== player.id && !other.isBot && other.color === option.name)
						const selected = player.color === option.name
						return (
							<button
								key={option.name}
								type="button"
								className="lobbySwatch"
								style={{
									'--swatch': option.hex
								}}
								disabled={Boolean(takenBy) || busy || savingProfile}
								data-managing-players={managingPlayers || undefined}
								data-taken={takenBy ? '' : undefined}
								aria-pressed={selected}
								aria-label={`${option.name}${takenBy ? ` \u2014 taken by ${takenBy.name}` : ''}`}
								title={takenBy ? `Taken by ${takenBy.name}` : option.name}
								onClick={() => onColour(option.name)}
							>
							</button>
						)
					})}
				</div>
			</div> : <span className="lobbyPlayerName" title={player.name}>
				{player.name}
			</span>}
			{player.isBot && isHost && <button
				type="button"
				className="lobbyRemoveBot"
				aria-label={`Remove ${player.name}`}
				disabled={busy}
				onClick={onRemove}
			>{'\u00d7'}</button>}
		</div>
	)
}

export default PlayerRow
