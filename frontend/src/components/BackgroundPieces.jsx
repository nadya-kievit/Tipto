import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { backgroundPieceAnchor, backgroundPieceCount, orderBackgroundPieces } from './backgroundDensity'
import { advancePieces, arrangePieces } from './backgroundMotion'
import { createBackgroundVariants } from './backgroundVariants'
import './BackgroundPieces.css'

const DEFAULT_BACKGROUND_PIECES = [
	// Each of the game's 16 shapes appears twice, with a different colour each time.
	{ name: 'L5', left: 7, top: 5, color: '#8B5CF6', shape: ['####', '...#'] },
	{ name: 'V3', left: 32, top: 13, color: '#F97316', shape: ['#.', '##'] },
	{ name: 'U5', left: 16, top: 31, color: '#EF4444', shape: ['##', '#.', '##'] },
	{ name: 'T5', left: 43, top: 38, color: '#3B82F6', shape: ['.#.', '.#.', '###'] },
	{ name: 'W5', left: 3, top: 54, color: '#14B8A6', shape: ['#..', '##.', '.##'] },
	{ name: 'P5', left: 28, top: 62, color: '#EAB308', shape: ['.#', '##', '##'] },
	{ name: 'F5', left: 11, top: 77, color: '#EC4899', shape: ['.#.', '###', '..#'] },
	{ name: 'O4', left: 39, top: 86, color: '#22C55E', shape: ['##', '##'] },
	{ name: 'L4', left: 4, top: 89, color: '#F97316', shape: ['###', '..#'] },
	{ name: 'T4', right: 8, top: 19, color: '#8B5CF6', shape: ['.#.', '###'] },
	{ name: 'Z4', right: 34, top: 3, color: '#EF4444', shape: ['##.', '.##'] },
	{ name: 'I1', right: 24, top: 43, color: '#3B82F6', shape: ['#'] },
	{ name: 'I2', right: 3, top: 59, color: '#14B8A6', shape: ['##'] },
	{ name: 'I3', right: 18, top: 8, color: '#EAB308', shape: ['###'] },
	{ name: 'I4', right: 38, top: 71, color: '#EC4899', shape: ['####'] },
	{ name: 'I5', right: 14, top: 66, color: '#22C55E', shape: ['#####'] },
	{ name: 'L5', right: 5, top: 83, color: '#EAB308', shape: ['####', '...#'] },
	{ name: 'V3', right: 27, top: 89, color: '#3B82F6', shape: ['#.', '##'] },
	{ name: 'U5', left: 49, top: 6, color: '#14B8A6', shape: ['##', '#.', '##'] },
	{ name: 'T5', right: 2, top: 37, color: '#EC4899', shape: ['.#.', '.#.', '###'] },
	{ name: 'W5', left: 34, top: 28, color: '#F97316', shape: ['#..', '##.', '.##'] },
	{ name: 'P5', right: 17, top: 24, color: '#8B5CF6', shape: ['.#', '##', '##'] },
	{ name: 'F5', left: 19, top: 46, color: '#22C55E', shape: ['.#.', '###', '..#'] },
	{ name: 'O4', right: 31, top: 55, color: '#EF4444', shape: ['##', '##'] },
	{ name: 'L4', left: 54, top: 57, color: '#3B82F6', shape: ['###', '..#'] },
	{ name: 'T4', left: 2, top: 22, color: '#14B8A6', shape: ['.#.', '###'] },
	{ name: 'Z4', right: 42, top: 23, color: '#EAB308', shape: ['##.', '.##'] },
	{ name: 'I1', left: 24, top: 4, color: '#EC4899', shape: ['#'] },
	{ name: 'I2', left: 8, top: 42, color: '#F97316', shape: ['##'] },
	{ name: 'I3', left: 23, top: 85, color: '#EF4444', shape: ['###'] },
	{ name: 'I4', right: 2, top: 5, color: '#22C55E', shape: ['####'] },
	{ name: 'I5', right: 2, top: 74, color: '#8B5CF6', shape: ['#####'] },
]

function BackgroundPieces({
	pieces = DEFAULT_BACKGROUND_PIECES,
	cellSize = 28,
	opacity = 0.1,
	compact = false,
	topCollisionSelector,
	className = '',
}) {
	const containerRef = useRef(null)
	const [variantSeed] = useState(() => Math.floor(Math.random() * 4294967296))
	const displayPieces = useMemo(() => orderBackgroundPieces(
		createBackgroundVariants(
			pieces, pieces === DEFAULT_BACKGROUND_PIECES ? 2 : 1, variantSeed,
		),
		variantSeed,
	), [pieces, variantSeed])

	useLayoutEffect(() => {
		const container = containerRef.current
		let width = container.clientWidth
		let height = container.clientHeight
		let topBoundary = 0
		const topObstacle = topCollisionSelector ? document.querySelector(topCollisionSelector) : null
		const measureTopBoundary = () => {
			if (!topObstacle) return 0
			const containerBounds = container.getBoundingClientRect()
			const obstacleBounds = topObstacle.getBoundingClientRect()
			return Math.max(0, Math.min(height, obstacleBounds.bottom - containerBounds.top))
		}
		topBoundary = measureTopBoundary()
		const movingPieces = [...container.children].map((element, index) => {
			const piece = displayPieces[index]
			const angle = Math.random() * Math.PI * 2
			const speed = 48 + Math.random() * 60
			const anchor = backgroundPieceAnchor(piece, width, height, element.offsetWidth)
			return {
				element,
				speed,
				cells: [...element.children].map(tile => ({
					x: tile.offsetLeft, y: tile.offsetTop,
					width: tile.offsetWidth, height: tile.offsetHeight,
				})),
				x: anchor.x,
				y: anchor.y,
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed,
				width: element.offsetWidth,
				height: element.offsetHeight,
			}
		})
		const paint = () => {
			for (const piece of movingPieces) {
				piece.element.style.visibility = piece.active ? '' : 'hidden'
				piece.element.style.transform = `translate3d(${piece.x}px, ${piece.y}px, 0)`
			}
		}
		const arrangeForViewport = () => {
			for (const piece of movingPieces) piece.active = false
			const count = backgroundPieceCount(width, height, movingPieces.length)
			arrangePieces(movingPieces.slice(0, count), width, height, topBoundary)
		}
		const observer = new ResizeObserver(() => {
			width = container.clientWidth
			height = container.clientHeight
			topBoundary = measureTopBoundary()
			for (const [index, piece] of movingPieces.entries()) {
				piece.width = piece.element.offsetWidth
				piece.height = piece.element.offsetHeight
				piece.cells = [...piece.element.children].map(tile => ({
					x: tile.offsetLeft, y: tile.offsetTop,
					width: tile.offsetWidth, height: tile.offsetHeight,
				}))
				const anchor = backgroundPieceAnchor(displayPieces[index], width, height, piece.width)
				piece.x = anchor.x
				piece.y = anchor.y
			}
			arrangeForViewport()
			paint()
		})
		observer.observe(container)
		if (topObstacle) observer.observe(topObstacle)
		let frame
		let previousTime = null
		const animate = time => {
			const seconds = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.1)
			previousTime = time
			advancePieces(movingPieces, seconds, width, height, topBoundary)
			paint()
			frame = requestAnimationFrame(animate)
		}
		const syncVisibility = () => {
			cancelAnimationFrame(frame)
			previousTime = null
			if (!document.hidden) frame = requestAnimationFrame(animate)
		}
		arrangeForViewport()
		paint()
		syncVisibility()
		document.addEventListener('visibilitychange', syncVisibility)
		return () => {
			cancelAnimationFrame(frame)
			observer.disconnect()
			document.removeEventListener('visibilitychange', syncVisibility)
		}
	}, [displayPieces, cellSize, compact, topCollisionSelector])

	return (
		<div
			ref={containerRef}
			className={`backgroundPieces${compact ? ' backgroundPiecesCompact' : ''}${className ? ` ${className}` : ''}`}
			style={{
				'--background-piece-size': `${cellSize}px`,
				'--background-piece-opacity': opacity,
			}}
			aria-hidden="true"
		>
			{displayPieces.map((piece, pieceIndex) => (
				<span
					key={pieceIndex}
					className="backgroundPiece"
					style={{
						zIndex: pieceIndex,
						'--background-piece-color': piece.color,
						'--background-piece-columns': piece.shape[0].length,
					}}
				>
					{piece.shape.flatMap((row, rowIndex) =>
						[...row].map((cell, columnIndex) => cell === '#' && (
							<i
								key={`${rowIndex}-${columnIndex}`}
								style={{ gridRow: rowIndex + 1, gridColumn: columnIndex + 1 }}
							/>
						))
					)}
				</span>
			))}
		</div>
	)
}

export default BackgroundPieces
