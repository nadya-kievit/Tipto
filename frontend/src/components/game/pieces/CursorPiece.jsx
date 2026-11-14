import { useLayoutEffect, useRef } from 'react'
import { getPlayerColorHex } from '../../../game/playerColors'
import BoardPiece from '../board/BoardPiece'

function CursorPiece({ piece, rotation, flipped, color, positionRef, cellSize = 28 }) {
	const elementRef = useRef(null)

	useLayoutEffect(() => {
		const element = elementRef.current
		let frame = null
		const paint = () => {
			frame = null
			const { x, y } = positionRef.current
			element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
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
	}, [positionRef])

	return (
		<div ref={elementRef} className="gameHeldPiece" data-held-piece aria-hidden="true" style={{
			position: 'fixed', top: 0, left: 0, width: 'max-content', zIndex: 1000,
			pointerEvents: 'none', willChange: 'transform', opacity: 0.6,
		}}>
			<BoardPiece piece={{ ...piece, rotation, flipped }} cellSize={cellSize} color={getPlayerColorHex(color)} />
		</div>
	)
}

export default CursorPiece
