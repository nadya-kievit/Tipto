import { useLayoutEffect, useRef } from 'react'
import { getPlayerColorHex } from '../../../game/playerColors'
import { displayCells, tileFinish } from '../../../game/piecePresentation'

function CursorPiece({ piece, rotation, flipped, color, positionRef, cellSize = 28 }) {
	const elementRef = useRef(null)
	const cells = displayCells(piece.cells, rotation, flipped)
	const width = (Math.max(...cells.map(([, col]) => col)) + 1) * (cellSize + 1) - 1
	const height = (Math.max(...cells.map(([row]) => row)) + 1) * (cellSize + 1) - 1

	useLayoutEffect(() => {
		const element = elementRef.current
		let frame = null
		const paint = () => {
			frame = null
			const { x, y } = positionRef.current
			element.style.transform = `translate3d(${x - width / 2}px, ${y - height / 2}px, 0)`
		}
		const move = event => {
			positionRef.current = { x: event.clientX, y: event.clientY }
			if (frame === null) frame = requestAnimationFrame(paint)
		}
		paint()
		window.addEventListener('pointermove', move, { passive: true })
		return () => {
			window.removeEventListener('pointermove', move)
			cancelAnimationFrame(frame)
		}
	}, [height, positionRef, width])

	return (
		<div ref={elementRef} className="gameHeldPiece" data-held-piece aria-hidden="true" style={{
			position: 'fixed', top: 0, left: 0, width, height, zIndex: 1000,
			pointerEvents: 'none', willChange: 'transform', opacity: 0.6,
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
