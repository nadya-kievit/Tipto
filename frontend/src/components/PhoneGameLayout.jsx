import { useEffect, useMemo, useRef, useState } from 'react'
import Board from './Board'
import Piece from './Piece'
import { displayCells, tileFinish } from '../game/piecePresentation'
import { isValidPlacement } from '../game/placementRules'
import { getPlayerColorHex } from '../playerColors'

const NOOP = () => {}

function secondsUntil(timestamp) {
	return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000))
}

function PhoneTimer({ endsAt, limit }) {
	const [remaining, setRemaining] = useState(() => secondsUntil(endsAt))
	useEffect(() => {
		const update = () => setRemaining(secondsUntil(endsAt))
		const interval = setInterval(update, 250)
		return () => clearInterval(interval)
	}, [endsAt])
	return <><span><i style={{ width: `${limit ? Math.min(100, remaining / limit * 100) : 100}%` }} /></span><b>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</b></>
}

function PhoneTurnCard({ game, canMove }) {
	const current = game.players.find(player => player.id === game.currentPlayerId)
	const color = getPlayerColorHex(current?.color)
	return <div className="phoneTurnCard" style={{ '--turn-color': color }}>
		<strong>{canMove ? 'Your turn' : `${current?.name || 'Player'}’s turn`}</strong>
		<div>{game.turnEndsAt ? <PhoneTimer key={game.turnNumber} endsAt={game.turnEndsAt} limit={game.settings.moveTimeLimitSeconds} /> : <b>No limit</b>}</div>
	</div>
}

function PhonePieceShape({ piece, cellSize, color, invalid = false }) {
	if (!piece) return null
	const cells = displayCells(piece.cells, piece.rotation, piece.flipped)
	const columns = Math.max(...cells.map(([, col]) => col)) + 1
	const rows = Math.max(...cells.map(([row]) => row)) + 1
	return <span className={`phonePieceShape${invalid ? ' invalid' : ''}`} style={{ width: columns * cellSize + columns - 1, height: rows * cellSize + rows - 1 }}>
		{cells.map(([row, col], index) => <i key={index} style={{
			width: cellSize, height: cellSize, top: row * (cellSize + 1), left: col * (cellSize + 1),
			...(invalid ? { background: '#EF4444', boxShadow: 'inset 0 0 0 1px #FFD1D1' } : tileFinish(color, piece.ability, 'tray')),
		}} />)}
	</span>
}

function placementReason(board, cells, player, isFirstMove, players, ability) {
	const height = board.length
	const width = board[0]?.length || 0
	if (!cells.length || cells.some(cell => cell.row < 0 || cell.row >= height || cell.col < 0 || cell.col >= width)) return 'Keep the whole piece on the board'
	if (cells.some(cell => board[cell.row][cell.col].playable === false)) return 'That square is not playable'
	if (cells.some(cell => board[cell.row][cell.col].occupied)) return 'Pieces cannot overlap'
	const reserved = new Set(players.filter(other => other.id !== player.id && other.startPosition && !other.pieces.some(piece => piece.placed)).map(other => `${other.startPosition.row},${other.startPosition.col}`))
	if (cells.some(cell => reserved.has(`${cell.row},${cell.col}`))) return 'That starting square is reserved'
	if (isFirstMove) return 'Your first piece must cover your starting square'
	let edge = false
	let corner = false
	for (const cell of cells) {
		edge ||= [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => board[cell.row + dr]?.[cell.col + dc]?.player === player.id)
		corner ||= [[-1, -1], [-1, 1], [1, -1], [1, 1]].some(([dr, dc]) => board[cell.row + dr]?.[cell.col + dc]?.player === player.id)
	}
	if (edge && ability !== 'connector') return 'Your pieces can only touch at the corners'
	if (ability === 'connector' && !edge && !corner) return 'Connector must touch along an edge or corner'
	if (ability !== 'scout' && !corner) return 'Your piece must touch one of your corners'
	return 'That piece cannot be placed there'
}

export default function PhoneGameLayout({
	game, me, board, canMove, pieces, selectedPiece, selectedPieceName, pendingPlacement,
	onStage, onRotate, onFlip, onPlace, onQuit, lastMove,
}) {
	const boardZoneRef = useRef(null)
	const slotRef = useRef(null)
	const stripRef = useRef(null)
	const frameRef = useRef(null)
	const pointerRef = useRef(null)
	const dragRef = useRef(null)
	const [drag, setDrag] = useState(null)
	const [toast, setToast] = useState('')
	const [scroll, setScroll] = useState({ width: 100, left: 0 })
	const unplaced = pieces.filter(piece => !piece.placed)
	const ownColor = getPlayerColorHex(me?.color)
	const isFirstMove = !me?.pieces.some(piece => piece.placed)
	const playerRows = useMemo(() => Object.keys(game.settings.players || {}).map(key => game.players.find(player => player.settingsPlayerKey === key)).filter(Boolean), [game])
	const boardView = useMemo(() => <Board
		board={board}
		onTileClick={NOOP}
		onBoardPointerMove={NOOP}
		onBoardLeave={NOOP}
		hoverCells={[]}
		pendingPlacement={pendingPlacement}
		players={game.players}
		currentPlayerId={me.id}
		preview={{ color: me.color, ability: selectedPiece?.ability }}
		lastMove={lastMove}
		trayPresentation
	/>, [board, game.players, lastMove, me.color, me.id, pendingPlacement, selectedPiece?.ability])

	useEffect(() => {
		const strip = stripRef.current
		if (!strip) return undefined
		const update = () => setScroll({ width: strip.scrollWidth ? strip.clientWidth / strip.scrollWidth * 100 : 100, left: strip.scrollWidth > strip.clientWidth ? strip.scrollLeft / (strip.scrollWidth - strip.clientWidth) * (100 - strip.clientWidth / strip.scrollWidth * 100) : 0 })
		update()
		strip.addEventListener('scroll', update, { passive: true })
		const observer = new ResizeObserver(update)
		observer.observe(strip)
		return () => { strip.removeEventListener('scroll', update); observer.disconnect() }
	}, [unplaced.length])

	useEffect(() => {
		const strip = stripRef.current
		if (!strip || sessionStorage.getItem('tipto-piece-strip-nudged')) return undefined
		sessionStorage.setItem('tipto-piece-strip-nudged', '1')
		const out = setTimeout(() => strip.scrollTo({ left: 60, behavior: 'smooth' }), 180)
		const back = setTimeout(() => strip.scrollTo({ left: 0, behavior: 'smooth' }), 880)
		return () => { clearTimeout(out); clearTimeout(back) }
	}, [])

	useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

	const setDragState = next => { dragRef.current = next; setDrag(next) }
	const updateDrag = (clientX, clientY) => {
		const boardElement = boardZoneRef.current?.querySelector('[data-game-board]')
		const tile = boardElement?.querySelector('.tile')
		if (!boardElement || !tile || !selectedPiece) return
		const rect = boardElement.getBoundingClientRect()
		const cellSize = tile.getBoundingClientRect().width
		const gap = board[0]?.length > 1 ? (rect.width - cellSize * board[0].length) / (board[0].length - 1) : 1
		const stride = cellSize + gap
		const oriented = displayCells(selectedPiece.cells, selectedPiece.rotation, selectedPiece.flipped)
		const pieceRows = Math.max(...oriented.map(([row]) => row)) + 1
		const pieceCols = Math.max(...oriented.map(([, col]) => col)) + 1
		const anchorCol = Math.round((clientX - rect.left - pieceCols * stride / 2) / stride)
		const anchorRow = Math.round((clientY - rect.top - (pieceRows + 2) * stride) / stride)
		const key = `${anchorRow},${anchorCol},${selectedPiece.rotation},${selectedPiece.flipped}`
		if (dragRef.current?.key === key) return
		const cells = oriented.map(([row, col]) => ({ row: anchorRow + row, col: anchorCol + col }))
		const valid = isValidPlacement(board, cells, me, isFirstMove, game.players, selectedPiece.ability)
		setDragState({ key, cells, valid, cellSize, left: rect.left + anchorCol * stride, top: rect.top + anchorRow * stride, reason: valid ? '' : placementReason(board, cells, me, isFirstMove, game.players, selectedPiece.ability) })
	}

	const handlePointerDown = event => {
		if (!selectedPiece || pendingPlacement) return
		if (!canMove) { setToast('Wait for your turn'); return }
		event.preventDefault()
		event.currentTarget.setPointerCapture(event.pointerId)
		pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
		updateDrag(event.clientX, event.clientY)
	}
	const handlePointerMove = event => {
		if (pointerRef.current?.id !== event.pointerId) return
		pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
		if (frameRef.current) return
		frameRef.current = requestAnimationFrame(() => { frameRef.current = null; updateDrag(pointerRef.current.x, pointerRef.current.y) })
	}
	const handlePointerUp = event => {
		if (pointerRef.current?.id !== event.pointerId) return
		pointerRef.current = null
		cancelAnimationFrame(frameRef.current)
		frameRef.current = null
		const dropped = dragRef.current
		if (dropped?.valid) {
			onPlace(dropped.cells, selectedPiece)
			if ('vibrate' in navigator) navigator.vibrate(10)
			setDragState(null)
			return
		}
		if (dropped) {
			setToast(dropped.reason)
			const slot = slotRef.current?.getBoundingClientRect()
			setDragState({ ...dropped, returning: true, left: slot ? slot.left + slot.width / 2 : dropped.left, top: slot ? slot.top + slot.height / 2 : dropped.top })
			setTimeout(() => setDragState(null), 180)
		}
	}

	useEffect(() => {
		if (!toast) return undefined
		const timeout = setTimeout(() => setToast(''), 1800)
		return () => clearTimeout(timeout)
	}, [toast])

	const stageCell = selectedPiece ? (selectedPiece.cells.length <= 2 ? 24 : 20) : 20
	return <div className="gamePage phoneGame">
		<div className="gameCity" aria-hidden="true" />
		<div className="gameCityFade" aria-hidden="true" />
		<header className="phoneGameHeader">
			<div className="phoneGameBrand">
				<h1><span className="phoneGameLogoMark" aria-hidden="true"><i /><i /><i /></span>Tipto</h1>
				<span>Room <strong>{game.inviteCode || game.gameId}</strong></span>
			</div>
			<button type="button" className="phoneHeaderLeave" onClick={onQuit}>Leave</button>
		</header>
		<main className="phoneGameMain">
			<aside className="phoneLeftRail">
				<PhoneTurnCard game={game} canMove={canMove} />
				<div className="phonePlayers">{playerRows.map(player => {
					const left = player.pieces.filter(piece => !piece.placed).length
					const score = player.pieces.reduce((sum, piece) => sum + (piece.placed ? piece.cells.length : 0), 0)
					return <div key={player.id} className={player.id === game.currentPlayerId ? 'active' : ''} style={{ '--player-color': getPlayerColorHex(player.color) }}><div><i /><span>{player.id === me.id ? 'You' : player.name}</span><b>{score}</b></div><em><i style={{ width: `${left / 16 * 100}%` }} /></em></div>
				})}</div>
			</aside>
			<div className="phoneBoardZone" ref={boardZoneRef}>
				{boardView}
			</div>
			<aside className="phonePieceTray" style={{ '--player-color': ownColor }}>
				<header><strong>Your pieces</strong><span>{unplaced.length}/{pieces.length}</span></header>
				<div ref={slotRef} className={`phoneStageSlot${canMove ? '' : ' waiting'}${drag ? ' dragging' : ''}`} style={{ '--player-color': ownColor }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
					{unplaced.length === 0 ? <span>All pieces placed</span> : selectedPiece && !drag ? <><PhonePieceShape piece={selectedPiece} cellSize={stageCell} color={ownColor} />{selectedPiece.ability && <small>{selectedPiece.ability === 'scout' ? 'Scout' : 'Connector'}</small>}</> : !selectedPiece ? <span>Choose a piece</span> : null}
				</div>
				<div className="phoneOrientation"><button type="button" onClick={() => onRotate(90)} disabled={!selectedPiece} aria-label="Rotate left">↶</button><button type="button" onClick={() => onRotate(270)} disabled={!selectedPiece} aria-label="Rotate right">↷</button><button type="button" onClick={onFlip} disabled={!selectedPiece} aria-label="Flip">↔</button></div>
				<div ref={stripRef} className="phonePieceStrip">{unplaced.map(piece => <Piece key={piece.name} piece={piece} color={me.color} isSelected={selectedPieceName === piece.name} isPlayable disabled={false} onClick={() => onStage(piece.name)} rotation={piece.rotation} flipped={piece.flipped} cellSize={7} />)}</div>
				<div className="phoneScrollTrack"><i style={{ width: `${scroll.width}%`, left: `${scroll.left}%` }} /></div>
			</aside>
		</main>
		{drag && selectedPiece && <div className={`phoneDragGhost${drag.returning ? ' returning' : ''}`} style={{ left: drag.left, top: drag.top }}><PhonePieceShape piece={selectedPiece} cellSize={drag.cellSize} color={ownColor} invalid={!drag.valid} /></div>}
		{toast && <div className="phoneGameToast" role="status">{toast}</div>}
	</div>
}
