import { displayCells } from '../../../game/piecePresentation'
import BoardTile from './BoardTile'
import '../../../styles/game/board.css'

export default function BoardPiece({ piece, cellSize, color }) {
	const cells = displayCells(piece.cells, piece.rotation, piece.flipped)
	const rows = Math.max(...cells.map(([row]) => row)) + 1
	const cols = Math.max(...cells.map(([, col]) => col)) + 1
	return <span className="gameBoardPiece" aria-hidden="true" style={{
		'--board-cell-size': `${cellSize}px`, '--board-columns': cols, '--board-rows': rows,
	}}>
		{cells.map(([row, col], index) => <BoardTile key={index} as="i" color={color} ability={piece.ability}
			style={{ gridRow: row + 1, gridColumn: col + 1 }} />)}
	</span>
}
