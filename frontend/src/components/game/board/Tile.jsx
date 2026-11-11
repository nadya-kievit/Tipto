import { getPlayerColorHex } from '../../../game/playerColors'
import BoardTile from './BoardTile'

export default function Tile({ value, row, col, isHovered, startPlayer, isOwnStart,
	ability, preview, isLastMove, isPending, lastMoveEdges, metrics }) {
	return <BoardTile className={`tile${startPlayer && !value.occupied ? ' startingTile' : ''}${isOwnStart && !value.occupied ? ' ownStartingTile' : ''}`}
		metrics={metrics} color={getPlayerColorHex(isHovered ? preview?.color : value.color)}
		ability={isHovered ? preview?.ability : ability} occupied={Boolean(isHovered || value.occupied)}
		playable={value.playable !== false} startColor={startPlayer ? getPlayerColorHex(startPlayer.color) : undefined}
		lastMoveEdges={isLastMove && !isHovered ? lastMoveEdges : null}
		data-row={row} data-col={col} data-piece-id={value.pieceId || undefined}
		data-ability={(isHovered ? preview?.ability : ability) || 'normal'} data-last-move={isLastMove || undefined}
		aria-label={startPlayer ? `${startPlayer.name}'s starting square` : undefined}
		style={{ opacity: isHovered || isPending ? 0.6 : 1 }} />
}
