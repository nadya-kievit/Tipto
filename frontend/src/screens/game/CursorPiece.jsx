import { useEffect } from 'react'
import { motion, useMotionValue } from 'motion/react'
import { getPlayerColorHex } from '../playerColors'
import { displayCells } from './piecePresentation'
import Tile from './Tile'
import './styles/board.css'

function CursorPiece({ piece, rotation, flipped, color, initialPosition, cellSize }) {
	const x = useMotionValue(initialPosition.x)
	const y = useMotionValue(initialPosition.y)

	useEffect(() => {
		const move = event => {
			x.set(event.clientX)
			y.set(event.clientY)
		}
		window.addEventListener('pointermove', move, { passive: true })
		return () => window.removeEventListener('pointermove', move)
	}, [x, y])

	const cells = displayCells(piece.cells, rotation, flipped)
	const rows = Math.max(...cells.map(([row]) => row)) + 1
	const columns = Math.max(...cells.map(([, col]) => col)) + 1
	const tileColor = getPlayerColorHex(color)

	return (
		<motion.div
			className="gameHeldPiece"
			data-held-piece
			style={{
				x,
				y,
				'--board-cell-size': `${cellSize}px`,
				'--board-columns': columns,
				'--board-rows': rows,
			}}
		>
			{cells.map(([row, col]) => (
				<Tile 
					key={`${row},${col}`} 
					as="i" 
					color={tileColor} 
					ability={piece.ability}
					style={{ gridRow: row + 1, gridColumn: col + 1 }} />
			))}
		</motion.div>
	)
}

export default CursorPiece
