import { useLayoutEffect, useRef, useState } from 'react'
import { boardMetricsForCell, fitBoardMetrics } from '../../../game/boardPresentation'
import '../../../styles/game/board.css'
import Tile from './Tile'

function Board({
	board, boardRotation = 0, onTileClick, onBoardPointerMove, onBoardLeave,
	hoverCells, pendingPlacement, players, currentPlayerId, preview, lastMove,
	onMetricsChange,
}) {
	const stageRef = useRef(null)
	const [tray, setTray] = useState(() => boardMetricsForCell(20))
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
	useLayoutEffect(() => {
		const stage = stageRef.current
		const update = () => {
			const style = getComputedStyle(stage)
			const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
			const height = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
			const next = fitBoardMetrics(width, height, viewHeight, viewWidth)
			if (next) setTray(current => current.cell === next.cell ? current : next)
		}
		update()
		const observer = new ResizeObserver(update)
		observer.observe(stage)
		return () => observer.disconnect()
	}, [viewHeight, viewWidth])
	useLayoutEffect(() => { onMetricsChange?.(tray) }, [onMetricsChange, tray])
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
			lastMoveEdges={lastEdges} metrics={tray} />
	}))
	return (
		<div className="boardStage" ref={stageRef}>
			<section className="gameBoardSurface" aria-label="Game board" style={{
				'--board-columns': viewWidth, '--board-rows': viewHeight,
				'--board-cell-size': `${tray.cell}px`, '--board-gap': `${tray.gap}px`,
				'--board-pad': `${tray.pad}px`, '--board-frame': `${tray.frame}px`, '--board-radius': `${tray.radius}px`,
			}}>
				<div className="board gameBoardGrid" data-game-board onClick={onTileClick} onPointerMove={handlePointerMove} onPointerLeave={onBoardLeave}>{tiles}</div>
			</section>
		</div>
	)
}

export default Board
