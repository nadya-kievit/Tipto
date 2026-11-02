import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { gameSocketUrl, getGame, quitGame, restartGame } from '../services/api'
import Board from '../components/game/board/Board'
import CursorPiece from '../components/game/pieces/CursorPiece'
import GameHeader from '../components/game/layout/GameHeader'
import PiecePanel from '../components/game/pieces/PiecePanel'
import PlayerRank from '../components/game/players/PlayerRank'
import TurnBanner from '../components/game/players/TurnBanner'
import WinnerModal from '../components/game/overlays/WinnerModal'
import GameNotice from '../components/game/overlays/GameNotice'
import PhoneGameLayout from '../components/game/layout/PhoneGameLayout'
import { PLAYER_COLOR_HEX, getPlayerColorHex } from '../game/playerColors'
import { canPlacePieceInAnyOrientation, closestLegalPlacement } from '../game/placementRules'
import { horizontalFlip, wheelRotation } from '../game/piecePresentation'
import { getNewGameNotice } from '../game/gameNotices'
import useUiScale from '../hooks/useUiScale'
import '../styles/game/base.css'
import '../styles/game/desktop.css'
import '../styles/game/phone.css'

const EMPTY_BOARD = []


function GameScreen({ gameId, onLeaveGame, onNeedsColor, onRegisterLeave, isPhoneGame = false }) {
	const { uiScale, style: uiScaleStyle } = useUiScale()

	const storageKey = `tipto-player-${gameId}`
	const socketRef = useRef(null)
	const revisionRef = useRef(-1)
	const lastServerNoticeRef = useRef('')
	const lastHoverTargetRef = useRef(null)
	const cursorPositionRef = useRef({ x: 0, y: 0 })
	const lastWheelRef = useRef(-Infinity)

	const [credentials] = useState(() => {
		const stored = localStorage.getItem(storageKey)
		return stored ? JSON.parse(stored) : null
	})

	const [game, setGame] = useState(null)
	const [pieceRotations, setPieceRotations] = useState({})
	const [pieceFlips, setPieceFlips] = useState({})
	const [selectedPieceName, setSelectedPieceName] = useState(null)
	const [cursorCellSize, setCursorCellSize] = useState(28)
	const [hoverCells, setHoverCells] = useState([])
	const [pendingPlacement, setPendingPlacement] = useState(null)
	const [lastMessage, setLastMessage] = useState('')
	const [isQuitting, setIsQuitting] = useState(false)
	const [isRestarting, setIsRestarting] = useState(false)
	const [closedWinnerTurnNumber, setClosedWinnerTurnNumber] = useState(null)
	const [isPortraitComputer, setIsPortraitComputer] = useState(() => window.matchMedia('(orientation: portrait) and (min-width: 700px)').matches)

	const me = game?.players.find(player => player.id === credentials?.playerId)

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

		if (!me || isPhoneGame) return playableNames

		if (game?.status !== 'playing') {
			for (const piece of me.pieces) {
				if (!piece.placed) playableNames.add(piece.name)
			}

			return playableNames
		}

		const isFirstMove = !me.pieces.some(piece => piece.placed)

		for (const piece of me.pieces) {
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
	}, [board, boardRotation, game?.players, game?.status, isPhoneGame, me])

	const selectedPiece = useMemo(() => 
		pieces.find(piece =>
			piece.name === selectedPieceName &&
			!piece.placed &&
			(isPhoneGame || playablePieceNames.has(piece.name))
		) || null,
		[isPhoneGame, pieces, playablePieceNames, selectedPieceName]
	)
	const availablePieces = useMemo(() => pieces.map(piece =>
		piece.name === pendingPlacement?.pieceName ? { ...piece, placed: true } : piece
	),
		[pendingPlacement?.pieceName, pieces]
	)
	const phoneSelectedPiece = isPhoneGame
		? (pendingPlacement ? null : selectedPiece)
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

	const clearHover = useCallback(() => {
		lastHoverTargetRef.current = null
		setHoverCells([])
	}, [])

	const clearSelection = useCallback(() => {
		setSelectedPieceName(null)
		clearHover()
	}, [clearHover])

	const receiveGame = useCallback(snapshot => {
		const revision = snapshot.revision ?? 0
		if (revision < revisionRef.current) return
		revisionRef.current = revision
		setGame(snapshot)
		setPendingPlacement(pending => {
			if (!pending) return null
			const confirmed = pending.cells.every(cell =>
				snapshot.board[cell.row]?.[cell.col]?.pieceId === pending.pieceId
			)
			return confirmed ? null : pending
		})
		const notice = getNewGameNotice(lastServerNoticeRef.current, snapshot.notice)
		lastServerNoticeRef.current = snapshot.notice || ''
		if (notice) setLastMessage(notice)
	}, [])

	useEffect(() => {
		if (game && !credentials) {
			onNeedsColor()
		}
	}, [game, credentials, onNeedsColor])

	useEffect(() => {
		const query = window.matchMedia('(orientation: portrait) and (min-width: 700px)')
		const update = () => setIsPortraitComputer(query.matches)
		query.addEventListener('change', update)
		return () => query.removeEventListener('change', update)
	}, [])


	useEffect(() => {
		let isActive = true

		async function loadGame() {
			try {
				const initialGame = await getGame(gameId, credentials)

				if (isActive) {
					receiveGame(initialGame)
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
	}, [gameId, credentials, receiveGame])


	useEffect(() => {
		if (!credentials) return

		let active = true
		const socket = new WebSocket(gameSocketUrl(gameId, credentials))
		socketRef.current = socket

		socket.onmessage = event => {
			if (!active) return
			const message = JSON.parse(event.data)

			if (message.type === 'game_state') {
				receiveGame(message.game)
			}

			if (message.type === 'error') {
				setPendingPlacement(null)
				setLastMessage(message.reason)
			}
		}

		socket.onclose = () => {
			if (active) setPendingPlacement(null)
		}

		return () => {
			active = false
			if (socketRef.current === socket) socketRef.current = null
			socket.close()
		}
	}, [gameId, credentials, receiveGame])


	useEffect(() => {
		if (isPhoneGame) return undefined
		const handleKeyDown = event => {
			if (!selectedPiece) return

			if (event.key === 'Escape') {
				event.preventDefault()
				clearSelection()
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
	}, [canMove, clearSelection, isPhoneGame, selectedPiece])

	useEffect(() => {
		if (isPhoneGame || !canMove || !selectedPiece) return
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
	}, [canMove, isPhoneGame, selectedPiece])

	useEffect(() => {
		if (isPhoneGame) return
		const boardElement = document.querySelector('[data-game-board]')
		if (!boardElement) return
		const observer = new ResizeObserver(() => {
			const tile = boardElement.querySelector('.tile')
			if (tile) setCursorCellSize(tile.getBoundingClientRect().width)
		})
		observer.observe(boardElement)
		return () => observer.disconnect()
	}, [boardHeight, boardWidth, isPhoneGame])


	useEffect(() => {
		if (isPhoneGame || !selectedPiece) return

		const handleOutsidePointerDown = event => {
			if (event.button !== 0) return
			if (event.target.closest('[data-game-board]')) return
			if (event.target.closest('[data-game-piece]')) return

			clearSelection()
		}

		document.addEventListener('pointerdown', handleOutsidePointerDown, true)

		return () => {
			document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
		}
	}, [clearSelection, isPhoneGame, selectedPiece])


	const handleCopyInvite = async () => {
		try {
			await navigator.clipboard.writeText(gameId)
			setLastMessage('Invite code copied.')
		} catch {
			setLastMessage('Could not copy the invite code.')
		}
	}


	const handleQuit = useCallback(async () => {
		if (
			isQuitting || !credentials ||
			!window.confirm('Leave this game? A bot will take your place.')
		) {
			return
		}

		setIsQuitting(true)

		try {
			await quitGame(gameId, credentials)

			localStorage.removeItem(storageKey)
			localStorage.removeItem(`tipto-admin-${gameId}`)
			socketRef.current?.close()
			onLeaveGame()
		} catch (err) {
			setLastMessage(err.message)
			setIsQuitting(false)
		}
	}, [credentials, gameId, isQuitting, onLeaveGame, storageKey])

	useEffect(() => onRegisterLeave?.(handleQuit), [handleQuit, onRegisterLeave])


	const handleRestart = async () => {
		if (!credentials || game?.status !== 'finished') {
			return
		}

		setIsRestarting(true)

		try {
			const restartedGame = await restartGame(gameId, credentials)
			receiveGame(restartedGame)
			setPendingPlacement(null)
			clearSelection()
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
			clearSelection()
			return
		}

		cursorPositionRef.current = {
			x: event.clientX,
			y: event.clientY,
		}
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

		clearSelection()
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
				{!isPhoneGame && <><div className="gameCity" aria-hidden="true" /><div className="gameCityFade" aria-hidden="true" /></>}
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

	const notice = <GameNotice message={lastMessage} onDismiss={() => setLastMessage('')} />
	const winnerModal = (
		<WinnerModal
			isOpen={isFinished && !isWinnerModalClosed}
			isTie={isTie}
			leaderboard={leaderboard}
			onClose={handleCloseWinnerModal}
			resultColor={resultColor}
			winner={winner}
		/>
	)


	if (isPhoneGame) {
		return <>
			<PhoneGameLayout
				notice={notice}
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
			{winnerModal}
		</>
	}

	return (
		<div className="gamePage" style={{ ...(isPortraitComputer ? { '--ui-scale': 1, '--text-scale': 1 } : uiScaleStyle), '--me': getPlayerColorHex(me?.color) }}>
			<div className="gameCity" aria-hidden="true" />
			<div className="gameCityFade" aria-hidden="true" />

			{selectedPiece && createPortal(
				<CursorPiece
					piece={selectedPiece}
					rotation={selectedPiece.rotation}
					flipped={selectedPiece.flipped}
					color={me?.color}
					positionRef={cursorPositionRef}
					cellSize={cursorCellSize}
				/>,
				document.body
			)}
			
			<GameHeader
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
			</GameHeader>

			<div className="gameMain">

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
					onBoardLeave={clearHover}
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
					onPieceClick={handlePieceClick}
					pieces={availablePieces}
					playablePieceNames={playablePieceNames}
					player={me}
					selectedPieceName={selectedPieceName}
					totalPieceCount={pieces.length}
					selectedPiece={selectedPiece}
					pieceCellSize={isPortraitComputer ? 20 : 14.5 * uiScale}
					fitPiecePreviews={isPortraitComputer}
				/>
			</div>

			{notice}
			{winnerModal}
		</div>
	)
}

export default GameScreen
