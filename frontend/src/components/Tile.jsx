import { getPlayerColorHex } from '../playerColors'
import { tileFinish } from '../game/piecePresentation'

function Tile({
	value, row, col, isHovered,
	startPlayer, isOwnStart, ability, preview, isLastMove, isPending,
	lastMoveEdges, desktopPresentation = false,
}) {
	const playable = value.playable !== false
	const finish = isHovered
		? tileFinish(getPlayerColorHex(preview?.color), preview?.ability)
		: value.occupied ? tileFinish(getPlayerColorHex(value.color), ability, 'board', isLastMove && !desktopPresentation)
			: { background: playable ? 'var(--cell)' : 'transparent', boxShadow: 'none' }
	if (startPlayer && !value.occupied && !isHovered) {
		const color = getPlayerColorHex(startPlayer.color)
		finish.background = desktopPresentation
			? `color-mix(in srgb, ${color} 28%, var(--cell))`
			: `color-mix(in srgb, ${color} ${isOwnStart ? 22 : 16}%, transparent)`
		finish.boxShadow = desktopPresentation
			? `inset 0 0 0 2px ${color}`
			: isOwnStart
			? `inset 0 0 0 2px var(--tile-outline), 0 0 0 3px color-mix(in srgb, ${color} 35%, transparent)`
			: 'none'
	}
	if (desktopPresentation && isLastMove && lastMoveEdges) {
		const color = `color-mix(in srgb, ${getPlayerColorHex(value.color)} 45%, #fff)`
		const edges = []
		if (lastMoveEdges.top) edges.push(`inset 0 2px 0 0 ${color}`)
		if (lastMoveEdges.right) edges.push(`inset -2px 0 0 0 ${color}`)
		if (lastMoveEdges.bottom) edges.push(`inset 0 -2px 0 0 ${color}`)
		if (lastMoveEdges.left) edges.push(`inset 2px 0 0 0 ${color}`)
		if (edges.length) finish.boxShadow = finish.boxShadow === 'none' ? edges.join(', ') : `${edges.join(', ')}, ${finish.boxShadow}`
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
			{startPlayer && !desktopPresentation && !isHovered && !value.occupied && <span className="startPositionMarker" aria-hidden="true" />}
		</div>
	)
}

export default Tile
