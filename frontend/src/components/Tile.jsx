import { getPlayerColorHex } from '../playerColors'
import { tileFinish } from '../game/piecePresentation'

function Tile({
	value, row, col, isHovered,
	startPlayer, isOwnStart, ability, preview, isLastMove, isPending,
}) {
	const playable = value.playable !== false
	const finish = isHovered
		? tileFinish(getPlayerColorHex(preview?.color), preview?.ability)
		: value.occupied ? tileFinish(getPlayerColorHex(value.color), ability, 'board', isLastMove)
			: { background: playable ? 'var(--cell)' : 'transparent', boxShadow: 'none' }
	if (startPlayer && !value.occupied && !isHovered) {
		const color = getPlayerColorHex(startPlayer.color)
		finish.background = `color-mix(in srgb, ${color} ${isOwnStart ? 22 : 16}%, transparent)`
		finish.boxShadow = isOwnStart
			? `inset 0 0 0 2px var(--tile-outline), 0 0 0 3px color-mix(in srgb, ${color} 35%, transparent)`
			: 'none'
	}
	if (playable) {
		const grout = '0 0 0 var(--board-gap, 0px) var(--grout, transparent)'
		finish.boxShadow = finish.boxShadow === 'none' ? grout : `${finish.boxShadow}, ${grout}`
	}
	return (
		<div className={`tile${playable ? '' : ' tileNonPlayable'}${startPlayer && !value.occupied ? ' startingTile' : ''}${isOwnStart && !value.occupied ? ' ownStartingTile' : ''}`}
			data-row={row} data-col={col} data-piece-id={value.pieceId || undefined}
			data-ability={(isHovered ? preview?.ability : ability) || 'normal'} data-last-move={isLastMove || undefined}
			aria-label={startPlayer ? `${startPlayer.name}'s starting square` : undefined}
			style={{ ...finish, opacity: isHovered || isPending ? 0.6 : 1, '--start-color': startPlayer ? getPlayerColorHex(startPlayer.color) : undefined }}>
			{startPlayer && !isHovered && !value.occupied && <span className="startPositionMarker" aria-hidden="true" />}
		</div>
	)
}

export default Tile
