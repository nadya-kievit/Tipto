import { getPlayerColorHex } from '../../../game/playerColors'
import { displayCells, tileFinish } from '../../../game/piecePresentation'

function CursorPiece({ piece, rotation, flipped, color, cursorRef, position, cellSize = 28 }) {
	const cells = displayCells(piece.cells, rotation, flipped)
	const width = (Math.max(...cells.map(([, col]) => col)) + 1) * (cellSize + 1) - 1
	const height = (Math.max(...cells.map(([row]) => row)) + 1) * (cellSize + 1) - 1
	return (
		<div ref={cursorRef} className="gameHeldPiece" data-held-piece aria-hidden="true" style={{
			position: 'fixed', top: 0, left: 0, width, height, zIndex: 1000,
			pointerEvents: 'none', willChange: 'transform', opacity: 0.6,
			transform: `translate3d(${position.x - width / 2}px, ${position.y - height / 2}px, 0)`,
		}}>
			{cells.map(([row, col], index) => <i key={index} className="pieceFinishTile" style={{
				position: 'absolute', boxSizing: 'border-box', borderRadius: 1,
				width: cellSize, height: cellSize,
				top: row * (cellSize + 1), left: col * (cellSize + 1),
				...tileFinish(getPlayerColorHex(color), piece.ability),
			}} />)}
		</div>
	)
}

export default CursorPiece
