import { useLayoutEffect, useRef, useState } from 'react'
import { getPlayerColorHex } from '../playerColors'
import { tileFinish } from '../game/piecePresentation'
import Tile from './Tile'

function Board({
	board, boardRotation = 0, onTileClick, onBoardPointerMove, onBoardLeave,
	hoverCells, pendingPlacement, players, currentPlayerId, preview, lastMove,
	desktopPresentation = false, trayPresentation = false,
}) {
	const stageRef = useRef(null)
	const [tray, setTray] = useState({ cell: 20, gap: 2, pad: 10 })
	const height = board.length
	const width = board[0]?.length || 0
	const viewHeight = boardRotation % 180 === 0 ? height : width
	const viewWidth = boardRotation % 180 === 0 ? width : height
	const pendingCells = new Set((pendingPlacement?.cells || []).map(cell => `${cell.row},${cell.col}`))
	const hovered = new Set(hoverCells.map(cell => `${cell.row},${cell.col}`))
	const lastCells = new Set((lastMove?.cells || []).map(cell => `${cell.row},${cell.col}`))
	const startingPlayers = new Map(players.filter(player => player.startPosition && !player.pieces.some(piece => piece.placed))
		.map(player => [`${player.startPosition.row},${player.startPosition.col}`, player]))
	const abilities = new Map(players.flatMap(player => player.pieces
		.filter(piece => piece.placed && piece.ability)
		.map(piece => [`${player.id}-${piece.name}`, piece.ability])))
	const ownColour = getPlayerColorHex(players.find(player => player.id === currentPlayerId)?.color)
	const lastMoveColour = getPlayerColorHex(players.find(player => player.id === lastMove?.playerId)?.color, ownColour)
	const firstMove = !players.find(player => player.id === currentPlayerId)?.pieces.some(piece => piece.placed)
	const framedPresentation = desktopPresentation || trayPresentation
	useLayoutEffect(() => {
		if (!framedPresentation || !stageRef.current) return undefined
		const stage = stageRef.current
		const update = () => {
			if (trayPresentation && !desktopPresentation) {
				const boardElement = stage.querySelector('[data-game-board]')
				const tile = boardElement?.querySelector('.tile')
				if (!boardElement || !tile) return
				const boardStyle = getComputedStyle(boardElement)
				const next = {
					cell: tile.getBoundingClientRect().width,
					gap: Number.parseFloat(boardStyle.columnGap) || 0,
					pad: Number.parseFloat(boardStyle.paddingLeft) || 0,
				}
				setTray(current => current.cell === next.cell && current.gap === next.gap && current.pad === next.pad ? current : next)
				return
			}
			const legend = stage.querySelector('.boardLegend')
			const scale = Number.parseFloat(getComputedStyle(stage.closest('.gamePage')).getPropertyValue('--ui-scale')) || 1
			const availableWidth = stage.clientWidth
			let availableHeight = stage.clientHeight - (legend?.offsetHeight || 0) - 14 * scale
			if (window.matchMedia('(orientation: portrait) and (min-width: 700px)').matches) {
				const main = stage.closest('.gameMain')
				const playersPanel = main?.querySelector('.playerRankPanel')
				if (main && playersPanel) {
					const mainStyle = getComputedStyle(main)
					availableHeight = main.clientHeight
						- Number.parseFloat(mainStyle.paddingTop)
						- Number.parseFloat(mainStyle.paddingBottom)
						- 2 * Number.parseFloat(mainStyle.rowGap)
						- playersPanel.getBoundingClientRect().height
						- (legend?.getBoundingClientRect().height || 0)
						- 16
						- 400
				}
			}
			const portraitComputer = window.matchMedia('(orientation: portrait) and (min-width: 700px)').matches
			const widthFactor = viewWidth + Math.max(0, viewWidth - 1) * 0.075 + 1
			const heightFactor = viewHeight + Math.max(0, viewHeight - 1) * 0.075 + 1
			let cell = Math.max(4, Math.floor(Math.min(availableWidth / widthFactor, availableHeight / heightFactor)))
			if (portraitComputer) {
				// Fit the rounded gap/padding and the tray's 1px outer outline, too.
				const fits = size => {
					const gap = Math.max(2, Math.round(size * 0.075))
					const padding = 2 * Math.round(size * 0.5) + 2
					return viewWidth * size + Math.max(0, viewWidth - 1) * gap + padding <= availableWidth
						&& viewHeight * size + Math.max(0, viewHeight - 1) * gap + padding <= availableHeight
				}
				while (cell > 4 && !fits(cell)) cell -= 1
			}
			const next = { cell, gap: Math.max(portraitComputer ? 2 : Math.round(2 * scale), Math.round(cell * 0.075)), pad: Math.round(cell * 0.5) }
			setTray(current => current.cell === next.cell && current.gap === next.gap && current.pad === next.pad ? current : next)
		}
		update()
		const observer = new ResizeObserver(update)
		observer.observe(stage)
		const legend = stage.querySelector('.boardLegend')
		if (legend) observer.observe(legend)
		const main = stage.closest('.gameMain')
		const playersPanel = main?.querySelector('.playerRankPanel')
		if (main) observer.observe(main)
		if (playersPanel) observer.observe(playersPanel)
		return () => observer.disconnect()
	}, [desktopPresentation, framedPresentation, trayPresentation, viewHeight, viewWidth, board])
	function viewToBoard(row, col) {
		switch (boardRotation) {
			case 90: return { row: height - 1 - col, col: row }
			case 180: return { row: height - 1 - row, col: width - 1 - col }
			case 270: return { row: col, col: width - 1 - row }
			default: return { row, col }
		}
	}
	function handlePointerMove(event) {
		if (!onBoardPointerMove) return
		const element = event.currentTarget
		const rect = element.getBoundingClientRect()
		const tile = element.querySelector('.tile')
		const cellSize = tile?.getBoundingClientRect().width || rect.width / viewWidth
		const elementStyle = getComputedStyle(element)
		const gap = Number.parseFloat(elementStyle.columnGap) || 0
		const paddingLeft = Number.parseFloat(elementStyle.paddingLeft) || 0
		const paddingTop = Number.parseFloat(elementStyle.paddingTop) || 0
		const stride = cellSize + gap
		const toBoardCoordinate = (position, count) => {
			const index = Math.max(0, Math.min(count - 1, Math.floor(position / stride)))
			const withinCell = Math.max(0, Math.min(1, (position - index * stride) / cellSize))
			return index + withinCell
		}
		onBoardPointerMove(
			toBoardCoordinate(event.clientY - rect.top - paddingTop, viewHeight),
			toBoardCoordinate(event.clientX - rect.left - paddingLeft, viewWidth),
		)
	}
	const tiles = Array.from({ length: viewHeight }, (_, viewRow) => Array.from({ length: viewWidth }, (_, viewCol) => {
		const position = viewToBoard(viewRow, viewCol)
		const key = `${position.row},${position.col}`
		const pending = pendingCells.has(key)
		const value = pending
			? { ...board[position.row][position.col], occupied: true, player: pendingPlacement.playerId, pieceId: pendingPlacement.pieceId, color: pendingPlacement.color }
			: board[position.row][position.col]
		const startPlayer = startingPlayers.get(key)
		const lastEdges = lastCells.has(key) ? {
			top: !lastCells.has(`${position.row - 1},${position.col}`),
			right: !lastCells.has(`${position.row},${position.col + 1}`),
			bottom: !lastCells.has(`${position.row + 1},${position.col}`),
			left: !lastCells.has(`${position.row},${position.col - 1}`),
		} : null
		return <Tile key={key} value={value} {...position} isHovered={hovered.has(key)}
			startPlayer={startPlayer} isOwnStart={startPlayer?.id === currentPlayerId}
			ability={pending ? pendingPlacement.ability : abilities.get(value.pieceId)}
			preview={preview} isPending={pending} isLastMove={Boolean(value.occupied && lastCells.has(key))}
			lastMoveEdges={lastEdges} desktopPresentation={framedPresentation} />
	}))
	const boardGrid = <div className="board" data-game-board onClick={onTileClick} onPointerMove={handlePointerMove} onPointerLeave={onBoardLeave}
		style={desktopPresentation ? { '--board-cell-size': `${tray.cell}px`, '--board-gap': `${tray.gap}px`, '--board-pad': `${tray.pad}px` } : undefined}>{tiles}</div>
	const trayWidth = viewWidth * tray.cell + Math.max(0, viewWidth - 1) * tray.gap + 2 * tray.pad
	const trayHeight = viewHeight * tray.cell + Math.max(0, viewHeight - 1) * tray.gap + 2 * tray.pad
	const trayRects = Array.from({ length: viewHeight * viewWidth }, (_, index) => {
		const viewRow = Math.floor(index / viewWidth)
		const viewCol = index % viewWidth
		const position = viewToBoard(viewRow, viewCol)
		if (board[position.row][position.col].playable === false) return null
		return <rect key={index} x={tray.pad + viewCol * (tray.cell + tray.gap)} y={tray.pad + viewRow * (tray.cell + tray.gap)} width={tray.cell} height={tray.cell} />
	})
	return (
		<div className="boardStage" ref={stageRef} style={{ '--board-columns': viewWidth, '--board-rows': viewHeight }}>
			<section className="boardPanel" aria-label="Game board">
				{framedPresentation ? <div className="boardWrap">
					<svg className="boardTray" aria-hidden="true" viewBox={`0 0 ${trayWidth} ${trayHeight}`}>
						<g className="boardTrayEdge" strokeWidth={2 * tray.pad + 2}>{trayRects}</g>
						<g className="boardTrayFill" strokeWidth={2 * tray.pad}>{trayRects}</g>
					</svg>
					{boardGrid}
				</div> : boardGrid}
				<div className="boardLegend">
					{firstMove && <>
						<span><i className="startingSquareLegend" style={{ '--start-color': ownColour }} />Starting squares</span>
					</>}
					<span><i className="lastMoveLegend" style={{ '--last-color': lastMoveColour }} />Last move</span>
					<span><i style={tileFinish(ownColour, 'scout', 'list')} />Scout</span>
					<span><i style={tileFinish(ownColour, 'connector', 'list')} />Connector</span>
				</div>
			</section>
		</div>
	)
}

export default Board
