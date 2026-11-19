import { readBoardPointer } from '../../../game/boardGeometry'
import '../../../styles/game/board.css'
import Tile from './Tile'

function Board({board, onTileClick, onBoardPointerMove, onBoardLeave, hoverCells, players, preview, lastMove}) {
	const height = board.length
	const width = board[0]?.length || 0
	const hovered = new Set(hoverCells.map(cell => `${cell.row},${cell.col}`))
	const lastCells = new Set((lastMove?.cells || []).map(cell => `${cell.row},${cell.col}`))

	//Map for the starting position of each player
	const startingPlayers = new Map(players
		.filter(player =>
			player.startPosition && !player.pieces.some(piece => piece.placed))
		.map(player =>
			[`${player.startPosition.row},${player.startPosition.col}`, player]
		)
	)

	const abilities = new Map(players.flatMap(player => player.pieces
		.filter(piece => piece.placed && piece.ability)
		.map(piece => [`${player.id}-${piece.name}`, piece.ability])))

	function handlePointerMove(event) {
		if (!onBoardPointerMove) return
		const { row, col } = readBoardPointer(event.currentTarget, event.clientX, event.clientY, height, width)
		onBoardPointerMove(row, col)
	}

	return (
		<div className="boardStage">
			<section
				className="board gameBoardGrid gameBoardSurface"
				style={{ '--board-columns': width, '--board-rows': height }}
				data-game-board
				onClick={onTileClick}
				onPointerMove={handlePointerMove}
				onPointerLeave={onBoardLeave}
			>
				{board.map((boardRow, row) => boardRow.map((value, col) => {
					const key = `${row},${col}`
					const startPlayer = startingPlayers.get(key)
					const lastEdges = lastCells.has(key) ? {
						top: !lastCells.has(`${row - 1},${col}`),
						right: !lastCells.has(`${row},${col + 1}`),
						bottom: !lastCells.has(`${row + 1},${col}`),
						left: !lastCells.has(`${row},${col - 1}`),
					} : null
					return (
						<Tile
							key={key}
							value={value}
							row={row}
							col={col}
							isHovered={hovered.has(key)}
							startPlayer={startPlayer}
							ability={abilities.get(value.pieceId)}
							preview={preview}
							isLastMove={Boolean(value.occupied && lastCells.has(key))}
							lastMoveEdges={lastEdges}
						/>
					)
				}))}
			</section>
		</div>
	)
}

export default Board
