import { getPlayerColorHex } from '../../../game/playerColors'
import BoardTile from './BoardTile'

export default function Tile({ value, row, col, isHovered, startPlayer,
	ability, preview, isLastMove, lastMoveEdges }) {
	return <BoardTile className={`tile${startPlayer && !value.occupied ? ' startingTile' : ''}`}
		color={getPlayerColorHex(isHovered ? preview?.color : value.color)}
		ability={isHovered ? preview?.ability : ability} occupied={Boolean(isHovered || value.occupied)}
		playable={value.playable !== false} startColor={startPlayer ? getPlayerColorHex(startPlayer.color) : undefined}
		lastMoveEdges={isLastMove && !isHovered ? lastMoveEdges : null}
		data-row={row} data-col={col} data-piece-id={value.pieceId || undefined}
		data-ability={(isHovered ? preview?.ability : ability) || 'normal'} data-last-move={isLastMove || undefined}
		style={{ opacity: isHovered ? 0.6 : 1 }} />
}
