import { getPlayerColorHex } from '../playerColors'
import { Bot } from 'lucide-react'

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
				{player.isBot && <Bot />}
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
