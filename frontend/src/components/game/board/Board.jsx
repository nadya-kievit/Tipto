import clsx from 'clsx'
import { readBoardPointer } from '../../../game/boardGeometry'
import { getPlayerColorHex } from '../../../game/playerColors'
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
					const isHovered = hovered.has(key)
					const isLastMove = Boolean(value.occupied && lastCells.has(key))
					const lastEdges = isLastMove && !isHovered ? {
						top: !lastCells.has(`${row - 1},${col}`),
						right: !lastCells.has(`${row},${col + 1}`),
						bottom: !lastCells.has(`${row + 1},${col}`),
						left: !lastCells.has(`${row},${col - 1}`),
					} : null
					return (
						<Tile
							key={key}
							className={clsx('tile', {
								startingTile: startPlayer && !value.occupied,
								tilePlacementPreview: isHovered,
							})}
							color={getPlayerColorHex(isHovered ? preview?.color : value.color)}
							ability={isHovered ? preview?.ability : abilities.get(value.pieceId)}
							occupied={Boolean(isHovered || value.occupied)}
							playable={value.playable !== false}
							startColor={startPlayer ? getPlayerColorHex(startPlayer.color) : undefined}
							lastMoveEdges={lastEdges}
							data-row={row}
							data-col={col}
							data-piece-id={value.pieceId || undefined}
						/>
					)
				}))}
			</section>
		</div>
	)
}

export default Board
