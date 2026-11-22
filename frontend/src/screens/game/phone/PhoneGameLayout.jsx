import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { copyText } from '../../../services/clipboard'
import { displayCells } from '../piece/piecePresentation'
import { getPlayerColorHex } from '../../playerColors'
import { phoneFit, playableBounds } from './phoneGeometry'
import { usesZoom, PHONE_ZOOM as Z, boardSize } from './phoneZoom'
import { readBoardRatios, boardGeometryStyle, observeBoardPixelRatio } from '../board/boardGeometry'
import useBoardPixelAlignment from './useBoardPixelAlignment'
import useTurnTimer from '../useTurnTimer'
import PhoneMinimap from './PhoneMinimap'
import Tile from '../board/Tile'
import usePhoneDrag from './usePhoneDrag'
import usePhoneZoomDrag from './usePhoneZoomDrag'
import usePhoneView from './usePhoneView'
import '../styles/board.css'

const ICONS = {
	people: (
		<>
			<circle cx="9" cy="8" r="3.2" />
			<path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
			<circle cx="17" cy="9" r="2.6" />
			<path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8" />
		</>
	),
	menu: (
		<>
			<circle cx="5" cy="12" r="1.2" />
			<circle cx="12" cy="12" r="1.2" />
			<circle cx="19" cy="12" r="1.2" />
		</>
	),
	left: <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />,
	right: <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />,
	flip: <path d="M12 3v18M8 7 3 12l5 5V7zM16 7l5 5-5 5V7z" />,
	copy: (
		<>
			<rect x="8" y="8" width="12" height="12" rx="1" />
			<path d="M16 8V4H4v12h4" />
		</>
	),
	chevron: <path d="m6 9 6 6 6-6" />,
}

function score(player) {
	return player.pieces.reduce((sum, piece) => sum + (piece.placed ? piece.cells.length : 0), 0)
}

function Icon({ kind = 'chevron' }) {
	return <svg viewBox="0 0 24 24">{ICONS[kind] || ICONS.chevron}</svg>
}

function Logo() {
	return (
		<i className="logo">
			<b /><b /><b /><b />
		</i>
	)
}

function PhoneTimer({ endsAt, limit }) {
	const { fraction, text } = useTurnTimer(endsAt, limit)

	return (
		<>
			<span className="phoneTimerTrack">
				<i style={{ width: `${fraction * 100}%` }} />
			</span>
			<span className="phoneTime">{text}</span>
		</>
	)
}

// Tray and opponent previews share the compact tile finishes.
function PhonePieceShape({ piece, cellSize, color, gap = 1 }) {
	if (!piece) return null

	const cells = displayCells(piece.cells, piece.rotation, piece.flipped)
	const columns = Math.max(...cells.map(([, col]) => col)) + 1
	const rows = Math.max(...cells.map(([row]) => row)) + 1
	const spacing = Math.round(gap)

	return (
		<span
			className="shape pieceFinish"
			data-ability={piece.ability || 'normal'}
			style={{
				'--piece-color': color,
				width: columns * cellSize + (columns - 1) * spacing,
				height: rows * cellSize + (rows - 1) * spacing,
			}}
		>
			{cells.map(([row, col]) => (
				<i
					key={`${row},${col}`}
					className="pieceFinishTile"
					style={{
						width: cellSize,
						height: cellSize,
						top: row * (cellSize + spacing),
						left: col * (cellSize + spacing),
					}}
				/>
			))}
		</span>
	)
}

// Native tray scrolling, with a larger hit area for the custom scrollbar.
function ScrollBar({ targetRef, count }) {
	const [scroll, setScroll] = useState({ fraction: 1, position: 0 })
	const grab = useRef(null)

	useLayoutEffect(() => {
		const target = targetRef.current
		const update = () => setScroll({
			fraction: target.clientWidth / target.scrollWidth,
			position: target.scrollLeft / target.scrollWidth,
		})

		update()
		const observer = new ResizeObserver(update)
		observer.observe(target)
		Array.from(target.children).forEach(child => observer.observe(child))
		target.addEventListener('scroll', update)

		return () => {
			observer.disconnect()
			target.removeEventListener('scroll', update)
		}
	}, [targetRef, count])

	const move = event => {
		if (!grab.current) return

		const target = targetRef.current
		const rect = event.currentTarget.getBoundingClientRect()
		target.scrollLeft = (event.clientX - rect.left - grab.current.offset) / rect.width * target.scrollWidth
	}

	const startGrab = event => {
		event.preventDefault()
		const rect = event.currentTarget.getBoundingClientRect()
		const thumb = event.currentTarget.firstElementChild.getBoundingClientRect()
		const isOverThumb = event.clientX >= thumb.left && event.clientX <= thumb.right

		grab.current = {
			offset: isOverThumb ? event.clientX - thumb.left : rect.width * scroll.fraction / 2,
		}
		event.currentTarget.setPointerCapture(event.pointerId)
		move(event)
	}

	const stopGrab = () => {
		grab.current = null
	}

	const handleKeyDown = event => {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return

		event.preventDefault()
		const target = targetRef.current

		if (event.key === 'Home') {
			target.scrollLeft = 0
		} else if (event.key === 'End') {
			target.scrollLeft = target.scrollWidth
		} else {
			const direction = event.key === 'ArrowRight' ? 1 : -1
			target.scrollLeft += direction * target.clientWidth / 2
		}
	}

	return (
		<div
			className="sbar trayBar"
			role="slider"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(scroll.position / (1 - scroll.fraction || 1) * 100)}
			tabIndex={0}
			hidden={scroll.fraction >= .999}
			onKeyDown={handleKeyDown}
			onPointerDown={startGrab}
			onPointerMove={move}
			onPointerUp={stopGrab}
			onPointerCancel={stopGrab}
			onLostPointerCapture={stopGrab}
		>
			<i style={{ width: `${scroll.fraction * 100}%`, left: `${scroll.position * 100}%` }} />
		</div>
	)
}

function PlayerList({ players, currentPlayerId, myId, expanded, onExpand }) {
	return (
		<section className="plist">
			{players.map((player, rank) => (
				<Fragment key={player.id}>
					<button
						className={clsx('prow', {
							active: player.id === currentPlayerId,
							open: expanded === player.id,
						})}
						style={{ '--pc': getPlayerColorHex(player.color) }}
						aria-expanded={player.id !== myId ? expanded === player.id : undefined}
						onClick={() => {
							if (player.id !== myId) onExpand(expanded === player.id ? null : player.id)
						}}
					>
						<span className="rk">{rank + 1}</span>
						<span className="nm">{player.id === myId ? 'You' : player.name}</span>
						{player.id === currentPlayerId && <span className="tag">Turn</span>}
						<span className="left">{player.pieces.filter(piece => !piece.placed).length} left</span>
						<span className="pts">{score(player)}</span>
						{player.id !== myId ? <Icon /> : <span className="cvSpace" />}
					</button>
					{expanded === player.id && (
						<div className="pieces">
							{player.pieces.filter(piece => !piece.placed).map(piece => (
								<div key={piece.name} title={piece.name}>
									<PhonePieceShape piece={piece} cellSize={6} color={getPlayerColorHex(player.color)} />
								</div>
							))}
						</div>
					)}
				</Fragment>
			))}
		</section>
	)
}

export default function PhoneGameLayout({
	game, me, board, canMove, pieces,
	onStage, onRotate, onFlip, onPlace, onQuit, isQuitting, onCopyError, notice,
}) {
	const rootRef = useRef(null)
	const trayRef = useRef(null)
	const surfaceRef = useRef(null)
	const [overlay, setOverlay] = useState(null)
	const [expanded, setExpanded] = useState(null)
	const [copied, setCopied] = useState(false)
	const [metrics, setMetrics] = useState({ cell: 1, gap: 1, pad: 0, frame: 0, tray: 11 })

	const bounds = playableBounds(board)
	const { row, col, rows, cols } = bounds
	const zoom = usesZoom(game)
	const color = getPlayerColorHex(me.color)
	const cameraRef = usePhoneView(rootRef, bounds, zoom)
	useBoardPixelAlignment(surfaceRef)

	useLayoutEffect(() => {
		const root = rootRef.current
		const fit = () => {
			if (zoom) {
				const zone = root.querySelector('.boardZone')
				const currentTray = (parseFloat(getComputedStyle(root).getPropertyValue('--row')) - 12) / 5
				// Reserve the initial 66px rows, then grow the tray into height
				// that the board cannot use because its width limits its size.
				const baseHeight = zone.clientHeight + 10 * (currentTray - 11) + 2
				const cell = Math.floor((zone.clientWidth - 12 - (cols - 1) * Z.gap) / cols)
				const boardHeight = rows * cell + (rows - 1) * Z.gap
				const extra = baseHeight - 16 - boardHeight
				let tray = Math.max(11, Math.min(16, Math.floor((Math.max(0, extra - 10) / 2 + 54) / 5)))

				while (tray > 11 && baseHeight - 2 - 10 * (tray - 11) - 16 < boardHeight) {
					tray--
				}

				const next = { cell: Z.cell, gap: Z.gap, pad: 0, frame: 0, tray }
				setMetrics(old => JSON.stringify(old) === JSON.stringify(next) ? old : next)
				return
			}

			const bottom = parseFloat(getComputedStyle(root.querySelector('.trayZone')).paddingBottom)
			const next = phoneFit(
				root.clientWidth,
				root.clientHeight,
				{ rows, cols },
				bottom,
				readBoardRatios(root),
				window.devicePixelRatio || 1,
			)

			if (next) setMetrics(old => JSON.stringify(old) === JSON.stringify(next) ? old : next)
		}

		const stopPixelRatio = observeBoardPixelRatio(fit)
		const observer = new ResizeObserver(fit)
		observer.observe(root)

		return () => {
			observer.disconnect()
			stopPixelRatio()
		}
	}, [rows, cols, zoom])

	useEffect(() => {
		const close = event => {
			if (event.type === 'keydown' && event.key !== 'Escape') return
			if (event.type === 'keydown' || !event.target.closest('.top')) {
				setOverlay(null)
				setExpanded(null)
			}
		}

		document.addEventListener('pointerdown', close)
		document.addEventListener('keydown', close)

		return () => {
			document.removeEventListener('pointerdown', close)
			document.removeEventListener('keydown', close)
		}
	}, [])

	const dragConfig = {
		game, me, board, canMove, pieces, bounds, metrics, color,
		onStage, onRotate, onFlip, onPlace,
		closeOverlays: () => {
			setOverlay(null)
			setExpanded(null)
		},
	}
	usePhoneDrag(rootRef, dragConfig, !zoom)
	usePhoneZoomDrag(rootRef, cameraRef, dragConfig, zoom)

	const current = game.players.find(player => player.id === game.currentPlayerId)
	const players = [...game.players].sort((a, b) => score(b) - score(a))
	const remaining = pieces.filter(piece => !piece.placed)
	const abilities = new Map(game.players.flatMap(player => player.pieces
		.filter(piece => piece.placed && piece.ability)
		.map(piece => [`${player.id}-${piece.name}`, piece.ability])))
	const starts = new Map(game.players
		.filter(player => player.startPosition)
		.map(player => [`${player.startPosition.row},${player.startPosition.col}`, player]))
	const roomCode = game.inviteCode || game.gameId
	const phoneBoardSize = boardSize(bounds)

	const copyRoom = async () => {
		try {
			await copyText(roomCode)
			setCopied(true)
		} catch {
			setCopied(false)
			onCopyError?.('Could not copy the room code.')
		}
	}

	const boardSurface = (
		<section ref={zoom ? undefined : surfaceRef} className={clsx('gameBoardSurface', { phoneZoomBoard: zoom })}>
			<div className="phoneBoard board gameBoardGrid" data-game-board>
				{board.slice(row, row + rows).flatMap((line, dr) => (
					line.slice(col, col + cols).map((value, dc) => {
						const key = `${row + dr},${col + dc}`
						const start = starts.get(key)

						return (
							<Tile
								key={key}
								color={getPlayerColorHex(value.color)}
								ability={abilities.get(value.pieceId)}
								occupied={value.occupied}
								playable={value.playable !== false}
								startColor={start ? getPlayerColorHex(start.color) : undefined}
								data-row={row + dr}
								data-col={col + dc}
							/>
						)
					})
				))}
				<div className="ghostLayer" hidden />
			</div>
		</section>
	)

	return (
		<div
			ref={rootRef}
			className={clsx('gamePage phoneGame', { phoneZoomGame: zoom })}
			style={{
				'--me': color,
				'--player-color': color,
				...boardGeometryStyle(zoom ? { cell: Z.cell, gap: Z.gap, pad: 0, frame: 0 } : metrics),
				'--board-columns': cols,
				'--board-rows': rows,
				'--phone-board-width': `${phoneBoardSize.width}px`,
				'--phone-board-height': `${phoneBoardSize.height}px`,
				'--row': `${5 * metrics.tray + 12}px`,
				'--col': `${5 * metrics.tray + 24}px`,
			}}
		>
			<header className="top">
				<div className="topRow">
					<button
						className="more"
						aria-expanded={overlay === 'menu'}
						onClick={() => setOverlay(overlay === 'menu' ? null : 'menu')}
					>
						<Logo />
						<Icon />
					</button>
					<div className="turn" style={{ '--pc': getPlayerColorHex(current?.color) }}>
						<span className="lbl">
							{game.currentPlayerId === me.id ? 'Your turn' : `${current?.name || 'Player'}'s turn`}
						</span>
						{game.turnEndsAt && (
							<PhoneTimer
								key={game.turnEndsAt}
								endsAt={game.turnEndsAt}
								limit={game.settings.moveTimeLimitSeconds}
							/>
						)}
					</div>
					<button
						className="plBtn"
						aria-expanded={overlay === 'players'}
						onClick={() => setOverlay(overlay === 'players' ? null : 'players')}
					>
						<Icon kind="people" />
						<small>#{players.findIndex(player => player.id === me.id) + 1}</small>
						<b>{score(me)}</b>
						<Icon />
					</button>
				</div>
				<div className="dragHint">
					<span className="dh" data-side="flip"><Icon kind="flip" />Flip</span>
					<span className="dhText">Hold the piece against an edge</span>
					<span className="dh" data-side="rot">Rotate<Icon kind="right" /></span>
				</div>
				{overlay === 'menu' && (
					<section className="menu">
						<div className="brand"><Logo />Tipto</div>
						<h5>Room</h5>
						<div className="code">
							<span>Code</span>
							<b>{roomCode}</b>
							<button onClick={copyRoom}>{copied ? '\u2713' : <Icon kind="copy" />}</button>
						</div>
						<button className="leaveBtn" onClick={onQuit} disabled={isQuitting}>Leave room</button>
					</section>
				)}
				{overlay === 'players' && (
					<PlayerList
						players={players}
						currentPlayerId={game.currentPlayerId}
						myId={me.id}
						expanded={expanded}
						onExpand={setExpanded}
					/>
				)}
			</header>
			<main className="boardZone">
				{zoom ? (
					<>
						<div className="phoneView">{boardSurface}</div>
						<PhoneMinimap cameraRef={cameraRef} board={board} players={game.players} bounds={bounds} />
					</>
				) : boardSurface}
			</main>
			{!zoom && (
				<>
					<div className="portal" data-side="flip" />
					<div className="portal" data-side="rot" />
				</>
			)}
			<section className="trayZone" aria-disabled={!canMove}>
				<div className="tray" ref={trayRef}>
					{remaining.map(piece => (
						<button
							key={piece.name}
							className="pc"
							data-piece={piece.name}
							disabled={!canMove}
							onContextMenu={event => event.preventDefault()}
						>
							<PhonePieceShape piece={piece} cellSize={metrics.tray} color={color} />
						</button>
					))}
				</div>
				<ScrollBar targetRef={trayRef} count={remaining.length} />
			</section>
			<div className="float" hidden />
			{notice}
		</div>
	)
}
