import { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { gameSocketUrl, getGame, quitGame, restartGame } from '../services/api'
import Board from '../components/Board'
import CursorPiece from '../components/CursorPiece'
import Header from '../components/Header'
import PiecePanel from '../components/PiecePanel'
import PlayerRank from '../components/PlayerRank'
import TurnBanner from '../components/TurnBanner'
import WaitingOverlay from '../components/WaitingOverlay'
import WinnerModal from '../components/WinnerModal'
import PhoneGameLayout from '../components/PhoneGameLayout'
import { PLAYER_COLOR_HEX, getPlayerColorHex } from '../playerColors'
import {
	canPlacePieceInAnyOrientation,
	closestLegalPlacement,
} from '../game/placementRules'
import { horizontalFlip, wheelRotation } from '../game/piecePresentation'
import useUiScale from '../hooks/useUiScale'
import './GameScreen.css'
import './GameDesktop.css'
import './PhoneGame.css'

const EMPTY_BOARD = []


function GameScreen({ gameId, onLeaveGame, onNeedsColor, isPhoneLandscape = false }) {
	const { uiScale, style: uiScaleStyle } = useUiScale()

	const storageKey = `tipto-player-${gameId}`
	const socketRef = useRef(null)
	const lastHoverTargetRef = useRef(null)
	const cursorPieceRef = useRef(null)
	const cursorPositionRef = useRef({ x: 0, y: 0 })
	const cursorFrameRef = useRef(null)
	const lastWheelRef = useRef(-Infinity)

	const [credentials] = useState(() => {
		const stored = localStorage.getItem(storageKey)
		return stored ? JSON.parse(stored) : null
	})

	const [game, setGame] = useState(null)
	const [pieceRotations, setPieceRotations] = useState({})
	const [pieceFlips, setPieceFlips] = useState({})
	const [selectedPieceName, setSelectedPieceName] = useState(null)
	const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 })
	const [cursorCellSize, setCursorCellSize] = useState(28)
	const [hoverCells, setHoverCells] = useState([])
	const [pendingPlacement, setPendingPlacement] = useState(null)
	const [lastMessage, setLastMessage] = useState('')
	const [isQuitting, setIsQuitting] = useState(false)
	const [isRestarting, setIsRestarting] = useState(false)
	const [closedWinnerTurnNumber, setClosedWinnerTurnNumber] = useState(null)

	const me = useMemo(() => 
		game?.players.find(player => player.id === credentials?.playerId),
		[game, credentials]
	)

	const canMove = game?.status === 'playing' && game.currentPlayerId === credentials?.playerId
	const board = game?.board || EMPTY_BOARD
	const boardHeight = board.length
	const boardWidth = board[0]?.length || 0
	const isFinished = game?.status === 'finished'
	const isWinnerModalClosed = isFinished && closedWinnerTurnNumber === game?.turnNumber
	const boardRotation = 0
	const pieces = useMemo(() => (me?.pieces || []).map(piece => ({
		...piece,
		rotation: pieceRotations[piece.name] || 0,
		flipped: pieceFlips[piece.name] || false,
	})), [me, pieceFlips, pieceRotations])

	const playablePieceNames = useMemo(() => {
		const playableNames = new Set()

		if (!me) return playableNames

		if (game?.status !== 'playing') {
			for (const piece of pieces) {
				if (!piece.placed) playableNames.add(piece.name)
			}

			return playableNames
		}

		const isFirstMove = !me.pieces.some(piece => piece.placed)

		for (const piece of pieces) {
			if (piece.placed) continue

			const isPlayable = canPlacePieceInAnyOrientation(
				board,
				piece,
				me,
				boardRotation,
				isFirstMove,
				game?.players || [],
			)

			if (isPlayable) playableNames.add(piece.name)
		}

		return playableNames
	}, [board, boardRotation, game?.players, game?.status, me, pieces])

	const selectedPiece = useMemo(() => 
		pieces.find(piece =>
			piece.name === selectedPieceName &&
			!piece.placed &&
			(isPhoneLandscape || playablePieceNames.has(piece.name))
		) || null,
		[isPhoneLandscape, pieces, playablePieceNames, selectedPieceName]
	)
	const availablePieces = useMemo(() => pieces.map(piece =>
		piece.name === pendingPlacement?.pieceName ? { ...piece, placed: true } : piece
	),
		[pendingPlacement?.pieceName, pieces]
	)
	const phoneSelectedPiece = isPhoneLandscape
		? selectedPiece || availablePieces.find(piece => !piece.placed) || null
		: null
	const winners = useMemo(() => {
		const winnerIds = game?.winnerIds?.length
			? game.winnerIds
			: game?.winnerId ? [game.winnerId] : []

		return winnerIds
			.map(winnerId => game?.players.find(player => player.id === winnerId))
			.filter(Boolean)
	}, [game])
	const winner = winners[0]
	const isTie = winners.length > 1
	const resultColor = getPlayerColorHex(winner?.color, PLAYER_COLOR_HEX.Yellow)
	const leaderboard = game?.leaderboard || []
	const isWaitingForPlayers = game?.status === 'waiting'

	useEffect(() => {
		if (game && !credentials) {
			onNeedsColor()
		}
	}, [game, credentials, onNeedsColor])


	useEffect(() => {
		let isActive = true

		async function loadGame() {
			try {
				const initialGame = await getGame(gameId, credentials)

				if (isActive) {
					setGame(initialGame)
				}
			} catch (err) {
				if (isActive) {
					setLastMessage(err.message)
				}
			}
		}

		loadGame()

		return () => {
			isActive = false
		}
	}, [gameId, credentials])


	useEffect(() => {
		if (!credentials) return

		const socket = new WebSocket(gameSocketUrl(gameId, credentials))
		socketRef.current = socket

		socket.onopen = () => {
			socket.send(JSON.stringify({ type: 'request_state' }))
		}

		socket.onmessage = event => {
			const message = JSON.parse(event.data)

			if (message.type === 'game_state') {
				setGame(message.game)
				setPendingPlacement(pending => {
					if (!pending) return null

					const isConfirmed = pending.cells.every(cell =>
						message.game.board[cell.row][cell.col].pieceId === pending.pieceId
					)

					return isConfirmed ? null : pending
				})

				if (message.game.notice) {
					setLastMessage(message.game.notice)
				}
			}

			if (message.type === 'error') {
				setPendingPlacement(null)
				setLastMessage(message.reason)
			}
		}

		socket.onclose = () => {
			setPendingPlacement(null)
		}

		return () => {
			socket.close()
		}
	}, [gameId, credentials])


	useEffect(() => {
		if (isPhoneLandscape) return undefined
		const handleKeyDown = event => {
			if (!selectedPiece) return

			if (event.key === 'Escape') {
				event.preventDefault()
				setSelectedPieceName(null)
				setHoverCells([])
				lastHoverTargetRef.current = null
				return
			}
			if (!canMove) return

			if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) return

			event.preventDefault()

			if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
				setPieceFlips(prev => ({
					...prev,
					[selectedPiece.name]: !selectedPiece.flipped,
				}))
				return
			}

			setPieceRotations(prev => {
				const rotationChange = event.key === 'ArrowRight' ? 90 : -90

				return {
					...prev,
					[selectedPiece.name]: (selectedPiece.rotation + rotationChange + 360) % 360,
				}
			})
		}

		window.addEventListener('keydown', handleKeyDown)

		return () => {
			window.removeEventListener('keydown', handleKeyDown)
		}
	}, [canMove, isPhoneLandscape, selectedPiece])

	useEffect(() => {
		if (isPhoneLandscape || !canMove || !selectedPiece) return
		const handleWheel = event => {
			event.preventDefault()
			if (!event.deltaY) return
			const now = performance.now()
			if (now - lastWheelRef.current < 110) return
			lastWheelRef.current = now
			setPieceRotations(current => ({
				...current,
				[selectedPiece.name]: wheelRotation(selectedPiece.rotation, event.deltaY),
			}))
		}
		const handleContextMenu = event => {
			if (!event.target.closest('.gamePage')) return
			event.preventDefault()
			const orientation = horizontalFlip(selectedPiece.rotation, selectedPiece.flipped)
			setPieceRotations(current => ({ ...current, [selectedPiece.name]: orientation.rotation }))
			setPieceFlips(current => ({ ...current, [selectedPiece.name]: orientation.flipped }))
		}
		window.addEventListener('wheel', handleWheel, { passive: false })
		window.addEventListener('contextmenu', handleContextMenu)
		return () => {
			window.removeEventListener('wheel', handleWheel)
			window.removeEventListener('contextmenu', handleContextMenu)
		}
	}, [canMove, isPhoneLandscape, selectedPiece])

	useEffect(() => {
		const boardElement = document.querySelector('[data-game-board]')
		if (!boardElement) return
		const observer = new ResizeObserver(() => {
			const tile = boardElement.querySelector('.tile')
			if (tile) setCursorCellSize(tile.getBoundingClientRect().width)
		})
		observer.observe(boardElement)
		return () => observer.disconnect()
	}, [boardHeight, boardWidth])


	useLayoutEffect(() => {
		if (isPhoneLandscape) return
		const element = cursorPieceRef.current

		if (!element || !selectedPiece) return

		const { width, height } = element.getBoundingClientRect()
		const { x, y } = cursorPositionRef.current

		element.style.transform =
			`translate3d(${x - width / 2}px, ${y - height / 2}px, 0)`
	}, [isPhoneLandscape, selectedPiece, cursorCellSize])


	useEffect(() => {
		if (isPhoneLandscape || !selectedPiece) return

		const handlePointerMove = event => {
			cursorPositionRef.current = { x: event.clientX, y: event.clientY }

			if (cursorFrameRef.current) return

			cursorFrameRef.current = requestAnimationFrame(() => {
				cursorFrameRef.current = null
				const element = cursorPieceRef.current

				if (!element) return

				const { width, height } = element.getBoundingClientRect()
				element.style.transform = `translate3d(${cursorPositionRef.current.x - width / 2}px, ${cursorPositionRef.current.y - height / 2}px, 0)`
			})
		}

		window.addEventListener('pointermove', handlePointerMove, { passive: true })

		return () => {
			window.removeEventListener('pointermove', handlePointerMove)
			cancelAnimationFrame(cursorFrameRef.current)
			cursorFrameRef.current = null
		}
	}, [isPhoneLandscape, selectedPiece])


	useEffect(() => {
		if (isPhoneLandscape || !selectedPiece) return

		const handleOutsidePointerDown = event => {
			if (event.button !== 0) return
			if (event.target.closest('[data-game-board]')) return
			if (event.target.closest('[data-game-piece]')) return

			lastHoverTargetRef.current = null
			setHoverCells([])
			setSelectedPieceName(null)
		}

		document.addEventListener('pointerdown', handleOutsidePointerDown, true)

		return () => {
			document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
		}
	}, [isPhoneLandscape, selectedPiece])


	const handleCopyInvite = async () => {
		await navigator.clipboard.writeText(gameId)
		setLastMessage('Invite code copied.')
	}


	const handleQuit = async () => {
		if (
			!credentials ||
			!window.confirm('Quit this game? Your pieces will be removed from the board.')
		) {
			return
		}

		setIsQuitting(true)

		try {
			await quitGame(gameId, credentials)

			localStorage.removeItem(storageKey)
			socketRef.current?.close()
			onLeaveGame()
		} catch (err) {
			setLastMessage(err.message)
			setIsQuitting(false)
		}
	}


	const handleRestart = async () => {
		if (!credentials || game?.status !== 'finished') {
			return
		}

		setIsRestarting(true)

		try {
			const restartedGame = await restartGame(gameId, credentials)
			setGame(restartedGame)
			setPendingPlacement(null)
			setSelectedPieceName(null)
			setHoverCells([])
			setLastMessage(restartedGame.notice || '')
		} catch (err) {
			setLastMessage(err.message)
		} finally {
			setIsRestarting(false)
		}
	}


	const handlePieceClick = (piece, event) => {
		const isPlayable = playablePieceNames.has(piece.name)

		if (piece.placed || !canMove || !isPlayable) return

		if (selectedPieceName === piece.name) {
			setSelectedPieceName(null)
			setHoverCells([])
			lastHoverTargetRef.current = null
			return
		}

		cursorPositionRef.current = {
			x: event.clientX,
			y: event.clientY,
		}
		setCursorPosition(cursorPositionRef.current)
		lastWheelRef.current = -Infinity
		setSelectedPieceName(piece.name)
	}


	const handleCloseWinnerModal = () => {
		setClosedWinnerTurnNumber(game?.turnNumber)
	}


	const submitPlacement = (cells, piece) => {
		if (!canMove || !piece || cells.length === 0 || pendingPlacement) {
			return
		}

		setPendingPlacement({
			cells,
			color: me.color,
			pieceId: `${me.id}-${piece.name}`,
			pieceName: piece.name,
			playerId: me.id,
			ability: piece.ability,
		})

		socketRef.current?.send(JSON.stringify({
			type: 'place_piece',
			pieceName: piece.name,
			cells,
		}))

		setSelectedPieceName(null)
		setHoverCells([])
	}


	const handleTileClick = () => {
		submitPlacement(hoverCells, selectedPiece)
	}


	const handlePhoneRotate = change => {
		if (!phoneSelectedPiece) return
		setPieceRotations(current => ({ ...current, [phoneSelectedPiece.name]: (phoneSelectedPiece.rotation + change) % 360 }))
	}


	const handlePhoneFlip = () => {
		if (!phoneSelectedPiece) return
		const orientation = horizontalFlip(phoneSelectedPiece.rotation, phoneSelectedPiece.flipped)
		setPieceRotations(current => ({ ...current, [phoneSelectedPiece.name]: orientation.rotation }))
		setPieceFlips(current => ({ ...current, [phoneSelectedPiece.name]: orientation.flipped }))
	}


	const handleBoardLeave = useCallback(() => {
		lastHoverTargetRef.current = null
		setHoverCells([])
	}, [])


	const handleBoardPointerMove = useCallback((pointerRow, pointerCol) => {
		lastHoverTargetRef.current = { pointerRow, pointerCol }

		if (!canMove || !selectedPiece || !me) {
			setHoverCells([])
			return
		}

		const isFirstMove = !me.pieces.some(piece => piece.placed)
		const nearestCells = closestLegalPlacement(
			board, selectedPiece, me, boardRotation, isFirstMove,
			game?.players || [], pointerRow, pointerCol,
		)
		setHoverCells(current => current.length === nearestCells.length &&
			current.every((cell, index) => cell.row === nearestCells[index].row && cell.col === nearestCells[index].col)
			? current
			: nearestCells)
	}, [board, boardRotation, canMove, game?.players, me, selectedPiece])


	useEffect(() => {
		const hoverTarget = lastHoverTargetRef.current

		if (!hoverTarget || !selectedPiece) return

		handleBoardPointerMove(hoverTarget.pointerRow, hoverTarget.pointerCol)
	}, [handleBoardPointerMove, selectedPiece])


	if (!game) {
		return (
			<div className="gamePage gameLoading" style={uiScaleStyle}>
				{!isPhoneLandscape && <><div className="gameCity" aria-hidden="true" /><div className="gameCityFade" aria-hidden="true" /></>}
				<h1 className="gameHeaderTitle">Tipto</h1>

				<div className="startPanel">
					<h2>Loading game...</h2>

					{lastMessage && (
						<div className="statusMessage statusMessageError">
							{lastMessage}
						</div>
					)}
				</div>
			</div>
		)
	}

	if (!credentials) {
		return null
	}

	if (isPhoneLandscape) {
		return <>
			<PhoneGameLayout
				game={game}
				me={me}
				board={board}
				canMove={canMove}
				pieces={availablePieces}
				selectedPiece={phoneSelectedPiece}
				selectedPieceName={phoneSelectedPiece?.name || null}
				pendingPlacement={pendingPlacement}
				onStage={setSelectedPieceName}
				onRotate={handlePhoneRotate}
				onFlip={handlePhoneFlip}
				onPlace={submitPlacement}
				onQuit={handleQuit}
				lastMove={game.moveHistory.at(-1)}
			/>
			<WinnerModal
				isOpen={isFinished && !isWinnerModalClosed}
				isTie={isTie}
				leaderboard={leaderboard}
				onClose={handleCloseWinnerModal}
				resultColor={resultColor}
				winner={winner}
			/>
		</>
	}

	return (
		<div className="gamePage" style={{ ...uiScaleStyle, '--me': getPlayerColorHex(me?.color) }}>
			<div className="gameCity" aria-hidden="true" />
			<div className="gameCityFade" aria-hidden="true" />

			{selectedPiece && createPortal(
				<CursorPiece
					piece={selectedPiece}
					rotation={selectedPiece.rotation}
					flipped={selectedPiece.flipped}
					color={me?.color}
					cursorRef={cursorPieceRef}
					position={cursorPosition}
					cellSize={cursorCellSize}
				/>,
				document.body
			)}
			
			<Header
				gameId={gameId}
				isQuitting={isQuitting}
				onCopyInvite={handleCopyInvite}
				onQuit={handleQuit}
			>
				<TurnBanner
					canMove={canMove}
					game={game}
					isRestarting={isRestarting}
					isTie={isTie}
					onRestart={handleRestart}
					resultColor={resultColor}
					winner={winner}
				/>
			</Header>

			<div className="gameMain">
				{isWaitingForPlayers && <WaitingOverlay game={game} />}

				<PlayerRank
					currentUserId={me?.id}
					game={game}
					pieceCellSize={8 * uiScale}
				/>

				<Board
					board={board}
					boardRotation={boardRotation}
					onTileClick={handleTileClick}
					onBoardPointerMove={handleBoardPointerMove}
					onBoardLeave={handleBoardLeave}
					hoverCells={hoverCells}
					pendingPlacement={pendingPlacement}
					players={game.players}
					currentPlayerId={me?.id}
					preview={{ color: me?.color, ability: selectedPiece?.ability }}
					lastMove={game.moveHistory.at(-1)}
					desktopPresentation
				/>

				<PiecePanel
					canMove={canMove}
					isWaitingForPlayers={isWaitingForPlayers}
					onPieceClick={handlePieceClick}
					pieces={availablePieces}
					playablePieceNames={playablePieceNames}
					player={me}
					selectedPieceName={selectedPieceName}
					totalPieceCount={pieces.length}
					selectedPiece={selectedPiece}
					pieceCellSize={14.5 * uiScale}
				/>
			</div>

			<WinnerModal
				isOpen={isFinished && !isWinnerModalClosed}
				isTie={isTie}
				leaderboard={leaderboard}
				onClose={handleCloseWinnerModal}
				resultColor={resultColor}
				winner={winner}
			/>
		</div>
	)
}

export default GameScreen
