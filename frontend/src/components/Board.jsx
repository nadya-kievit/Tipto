import { getPlayerColorHex } from '../playerColors'
import { tileFinish } from '../game/piecePresentation'
import Tile from './Tile'

function Board({
	board, boardRotation = 0, onTileClick, onBoardPointerMove, onBoardLeave,
	hoverCells, pendingPlacement, players, currentPlayerId, preview, lastMove,
}) {
	const height = board.length
	const width = board[0]?.length || 0
	const viewHeight = boardRotation % 180 === 0 ? height : width
	const viewWidth = boardRotation % 180 === 0 ? width : height
	const pendingCells = new Set((pendingPlacement?.cells || []).map(cell => `${cell.row},${cell.col}`))
	const hovered = new Set(hoverCells.map(cell => `${cell.row},${cell.col}`))
	const lastCells = new Set((lastMove?.cells || []).map(cell => `${cell.row},${cell.col}`))
	const startingPlayers = new Map(players.filter(player => player.startPosition && !player.pieces.some(piece => piece.placed))
		.map(player => [`${player.startPosition.row},${player.startPosition.col}`, player]))
	const abilities = new Map(players.flatMap(player => player.pieces
		.filter(piece => piece.placed && piece.ability)
		.map(piece => [`${player.id}-${piece.name}`, piece.ability])))
	const ownColour = getPlayerColorHex(players.find(player => player.id === currentPlayerId)?.color)
	const firstMove = !players.find(player => player.id === currentPlayerId)?.pieces.some(piece => piece.placed)
	function viewToBoard(row, col) {
		switch (boardRotation) {
			case 90: return { row: height - 1 - col, col: row }
			case 180: return { row: height - 1 - row, col: width - 1 - col }
			case 270: return { row: col, col: width - 1 - row }
			default: return { row, col }
		}
	}
	function handlePointerMove(event) {
		if (!onBoardPointerMove) return
		const element = event.currentTarget
		const rect = element.getBoundingClientRect()
		const tile = element.querySelector('.tile')
		const cellSize = tile?.getBoundingClientRect().width || rect.width / viewWidth
		const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0
		const stride = cellSize + gap
		const toBoardCoordinate = (position, count) => {
			const index = Math.max(0, Math.min(count - 1, Math.floor(position / stride)))
			const withinCell = Math.max(0, Math.min(1, (position - index * stride) / cellSize))
			return index + withinCell
		}
		onBoardPointerMove(
			toBoardCoordinate(event.clientY - rect.top, viewHeight),
			toBoardCoordinate(event.clientX - rect.left, viewWidth),
		)
	}
	return (
		<div className="boardStage" style={{ '--board-columns': viewWidth, '--board-rows': viewHeight }}>
			<section className="boardPanel" aria-label="Game board">
				<div className="board" data-game-board onClick={onTileClick} onPointerMove={handlePointerMove} onPointerLeave={onBoardLeave}>
					{Array.from({ length: viewHeight }, (_, viewRow) => Array.from({ length: viewWidth }, (_, viewCol) => {
						const position = viewToBoard(viewRow, viewCol)
						const key = `${position.row},${position.col}`
						const pending = pendingCells.has(key)
						const value = pending
							? { ...board[position.row][position.col], occupied: true, player: pendingPlacement.playerId, pieceId: pendingPlacement.pieceId, color: pendingPlacement.color }
							: board[position.row][position.col]
						const startPlayer = startingPlayers.get(key)
						return <Tile key={key} value={value} {...position} isHovered={hovered.has(key)}
							startPlayer={startPlayer} isOwnStart={startPlayer?.id === currentPlayerId}
							ability={pending ? pendingPlacement.ability : abilities.get(value.pieceId)}
							preview={preview} isPending={pending} isLastMove={Boolean(value.occupied && lastCells.has(key))} />
					}))}
				</div>
				<div className="boardLegend">
					{firstMove && <>
						<span><i className="startingSquareLegend" style={{ '--start-color': ownColour }} />Starting squares</span>
						<span><i className="startingSquareLegend ownStartingSquareLegend" style={{ '--start-color': ownColour }} />Yours</span>
					</>}
					<span><i className="lastMoveLegend" />Last move</span>
					<span><i style={tileFinish(ownColour, 'scout', 'list')} />Scout</span>
					<span><i style={tileFinish(ownColour, 'connector', 'list')} />Connector</span>
				</div>
			</section>
		</div>
	)
}

export default Board
