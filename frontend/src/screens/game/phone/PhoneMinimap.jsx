import { useLayoutEffect, useRef } from 'react'
import { getPlayerColorHex } from '../../playerColors'
import { PHONE_ZOOM as Z, minimapFrame } from './phoneZoom'

const DEFAULT_CELL_COLOR = '#4a5060'

function prepareCanvas(canvas, bounds) {
	const pixelRatio = window.devicePixelRatio || 1
	const width = bounds.cols * Z.miniCell
	const height = bounds.rows * Z.miniCell
	const pixelWidth = Math.round(width * pixelRatio)
	const pixelHeight = Math.round(height * pixelRatio)

	if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
		canvas.width = pixelWidth
		canvas.height = pixelHeight
	}

	canvas.style.width = `${width}px`
	canvas.style.height = `${height}px`
	const ctx = canvas.getContext('2d')
	ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
	ctx.clearRect(0, 0, width, height)
	return ctx
}

function playerColors(players) {
	const starts = new Map()
	const owners = new Map()

	for (const player of players) {
		const color = getPlayerColorHex(player.color)
		owners.set(player.id, color)
		if (player.startPosition) {
			const { row, col } = player.startPosition
			starts.set(`${row},${col}`, color)
		}
	}

	return { starts, owners }
}

function cellColor(cell, position, colors) {
	if (!cell.occupied) {
		return colors.starts.get(position) || DEFAULT_CELL_COLOR
	}

	if (cell.color) return getPlayerColorHex(cell.color) || DEFAULT_CELL_COLOR

	return colors.owners.get(cell.player) || DEFAULT_CELL_COLOR
}

function drawBoard(ctx, board, bounds, colors) {
	for (let row = 0; row < bounds.rows; row++) {
		for (let col = 0; col < bounds.cols; col++) {
			const boardRow = row + bounds.row
			const boardCol = col + bounds.col
			const cell = board[boardRow][boardCol]
			if (cell.playable === false) continue

			ctx.fillStyle = cellColor(cell, `${boardRow},${boardCol}`, colors)
			ctx.fillRect(col * Z.miniCell, row * Z.miniCell, Z.miniCell - 0.4, Z.miniCell - 0.4)
		}
	}
}

function drawViewport(ctx, canvas, camera, bounds) {
	const frame = minimapFrame(camera.size, camera.board, camera.view, bounds)
	canvas.dataset.hasFrame = Boolean(frame)
	if (!frame) return

	ctx.strokeStyle = '#fff'
	ctx.lineWidth = 1.5
	ctx.strokeRect(frame.x, frame.y, frame.width, frame.height)
}

export default function PhoneMinimap({ cameraRef, board, players, bounds }) {
	const canvasRef = useRef(null)

	useLayoutEffect(() => {
		const camera = cameraRef.current
		const canvas = canvasRef.current
		const colors = playerColors(players)

		const draw = () => {
			if (!camera.view) return
			const ctx = prepareCanvas(canvas, bounds)
			drawBoard(ctx, board, bounds, colors)
			drawViewport(ctx, canvas, camera, bounds)
		}

		// Camera movement happens outside React; repaint alongside its transform.
		camera.listeners.add(draw)
		draw()
		return () => camera.listeners.delete(draw)
	}, [cameraRef, board, players, bounds])

	return (
		<div className="phoneMini" role="button" tabIndex={0}>
			<canvas ref={canvasRef} />
			<span className="phoneMiniExpand">
				<svg viewBox="0 0 24 24">
					<path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
				</svg>
			</span>
		</div>
	)
}
