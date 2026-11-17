import { displayCells } from '../../../game/piecePresentation'
import BoardTile from './BoardTile'
import '../../../styles/game/board.css'
import { useLayoutEffect, useRef } from 'react'
import { boardSpacing, readBoardRatios, boardGeometryStyle } from '../../../game/boardGeometry'

export default function BoardPiece({ piece, cellSize, color }) {
	const ref = useRef(null)
	useLayoutEffect(() => {
		const spacing = boardSpacing(cellSize, readBoardRatios(ref.current), window.devicePixelRatio || 1)
		for (const [name, value] of Object.entries(boardGeometryStyle({ cell: cellSize, ...spacing }))) {
			ref.current.style.setProperty(name, value)
		}
	}, [cellSize])
	const cells = displayCells(piece.cells, piece.rotation, piece.flipped)
	const rows = Math.max(...cells.map(([row]) => row)) + 1
	const cols = Math.max(...cells.map(([, col]) => col)) + 1
	return <span ref={ref} className="gameBoardPiece" aria-hidden="true" style={{
		'--board-cell-size': `${cellSize}px`, '--board-columns': cols, '--board-rows': rows,
	}}>
		{cells.map(([row, col], index) => <BoardTile key={index} as="i" color={color} ability={piece.ability}
			style={{ gridRow: row + 1, gridColumn: col + 1 }} />)}
	</span>
}
