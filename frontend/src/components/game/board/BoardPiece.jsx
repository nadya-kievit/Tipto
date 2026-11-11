import { displayCells } from '../../../game/piecePresentation'
import BoardTile from './BoardTile'

export default function BoardPiece({ piece, metrics, color }) {
	const cells = displayCells(piece.cells, piece.rotation, piece.flipped)
	const rows = Math.max(...cells.map(([row]) => row)) + 1
	const cols = Math.max(...cells.map(([, col]) => col)) + 1
	const stride = metrics.cell + metrics.gap
	return <span className="gameBoardPiece" aria-hidden="true" style={{ width: cols * stride - metrics.gap, height: rows * stride - metrics.gap }}>
		{cells.map(([row, col], index) => <BoardTile key={index} as="i" metrics={metrics} color={color} ability={piece.ability}
			style={{ position: 'absolute', top: row * stride, left: col * stride }} />)}
	</span>
}
