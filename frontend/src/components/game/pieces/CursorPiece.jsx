import { useLayoutEffect, useRef } from 'react'
import { getPlayerColorHex } from '../../../game/playerColors'
import BoardPiece from '../board/BoardPiece'
import { pixelOffset } from '../../../game/boardGeometry'

function CursorPiece({ piece, rotation, flipped, color, positionRef, cellSize = 28 }) {
	const elementRef = useRef(null)

	useLayoutEffect(() => {
		const element = elementRef.current
		let frame = null
		const paint = () => {
			frame = null
			const { x, y } = positionRef.current
			const rect = element.getBoundingClientRect()
			const ratio = window.devicePixelRatio || 1
			const left = x - rect.width / 2
			const top = y - rect.height / 2
			element.style.transform = `translate3d(${left + pixelOffset(left, ratio)}px, ${top + pixelOffset(top, ratio)}px, 0)`
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
	}, [positionRef, cellSize, piece, rotation, flipped])

	return (
		<div ref={elementRef} className="gameHeldPiece" data-held-piece style={{
			position: 'fixed', top: 0, left: 0, width: 'max-content', zIndex: 1000,
			pointerEvents: 'none', willChange: 'transform', opacity: 0.6,
		}}>
			<BoardPiece piece={{ ...piece, rotation, flipped }} cellSize={cellSize} color={getPlayerColorHex(color)} />
		</div>
	)
}

export default CursorPiece
