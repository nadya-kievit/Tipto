import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { gameSocketUrl, getGame, quitGame, restartGame } from '../services/api'
import Board from '../components/game/board/Board'
import CursorPiece from '../components/game/pieces/CursorPiece'
import Header from '../components/Header'
import PiecePanel from '../components/game/pieces/PiecePanel'
import PlayerRank from '../components/game/players/PlayerRank'
import TurnBanner from '../components/game/players/TurnBanner'
import WinnerModal from '../components/game/overlays/WinnerModal'
import PhoneGameLayout from '../components/game/layout/PhoneGameLayout'
import { PLAYER_COLOR_HEX, getPlayerColorHex } from '../game/playerColors'
import { canPlacePieceInAnyOrientation, closestLegalPlacement } from '../game/placementRules'
import { horizontalFlip, wheelRotation } from '../game/piecePresentation'
import { getNewGameNotice, readDismissedGameNotices, saveDismissedGameNotices } from '../game/gameNotices'
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
	const [cursorStart, setCursorStart] = useState({ x: 0, y: 0 })
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
	const [lastMessage, setLastMessage] = useState('')
	const [dismissedMessages, setDismissedMessages] = useState(() => readDismissedGameNotices(gameId, credentials?.playerId))
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
				isFirstMove,
				game?.players || [],
			)

			if (isPlayable) playableNames.add(piece.name)
		}

		return playableNames
	}, [board, game?.players, game?.status, isPhoneGame, me])

	const selectedPiece = useMemo(() => 
		pieces.find(piece =>
			piece.name === selectedPieceName &&
			!piece.placed &&
			(isPhoneGame || playablePieceNames.has(piece.name))
		) || null,
		[isPhoneGame, pieces, playablePieceNames, selectedPieceName]
	)
	const phoneSelectedPiece = isPhoneGame ? selectedPiece : null

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
				setLastMessage(message.reason)
			}
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

		setCursorStart({
			x: event.clientX,
			y: event.clientY,
		})
		lastWheelRef.current = -Infinity
		setSelectedPieceName(piece.name)
	}


	const handleCloseWinnerModal = () => {
		setClosedWinnerTurnNumber(game?.turnNumber)
	}


	const submitPlacement = (cells, piece) => {
		const socket = socketRef.current
		if (!canMove || !piece || cells.length === 0 || socket?.readyState !== WebSocket.OPEN) return

		socket.send(JSON.stringify({
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
			board, selectedPiece, me, isFirstMove,
			game?.players || [], pointerRow, pointerCol,
		)
		setHoverCells(current => current.length === nearestCells.length &&
			current.every((cell, index) => cell.row === nearestCells[index].row && cell.col === nearestCells[index].col)
			? current
			: nearestCells)
	}, [board, canMove, game?.players, me, selectedPiece])


	useEffect(() => {
		const hoverTarget = lastHoverTargetRef.current

		if (!hoverTarget || !selectedPiece) return

		handleBoardPointerMove(hoverTarget.pointerRow, hoverTarget.pointerCol)
	}, [handleBoardPointerMove, selectedPiece])


	if (!game) {
		return (
			<div className="gamePage gameLoading" style={uiScaleStyle}>
				<h1 className="tiptoLogo">
					<span className="tiptoLogoMark"><i/><i/><i/></span>
					<span>Tipto</span>
				</h1>

				<div className="startPanel">
					<h2>Loading game...</h2>
				</div>
			</div>
		)
	}

	if (!credentials) {
		return null
	}

	const dismissMessage = () => {
		const dismissed = new Set(dismissedMessages)
		dismissed.add(lastMessage)
		saveDismissedGameNotices(gameId, credentials?.playerId, dismissed)
		setDismissedMessages(dismissed)
		setLastMessage('')
	}
	const noticeMessage = getNewGameNotice('', lastMessage, dismissedMessages)
	const notice = noticeMessage ? (
		<div className="gameNotice" role="status">
			<span>{noticeMessage}</span>
			<button type="button" onClick={dismissMessage}>Dismiss</button>
		</div>
	) : null


	if (isPhoneGame) {
		return <>
			<PhoneGameLayout
				notice={notice}
				game={game}
				me={me}
				board={board}
				canMove={canMove}
				pieces={pieces}
				selectedPiece={phoneSelectedPiece}
				selectedPieceName={phoneSelectedPiece?.name || null}
				onStage={setSelectedPieceName}
				onRotate={handlePhoneRotate}
				onFlip={handlePhoneFlip}
				onPlace={submitPlacement}
				onQuit={handleQuit}
				isQuitting={isQuitting}
				onCopyError={setLastMessage}
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
		<div className="gamePage">

			{selectedPiece && createPortal(
				<CursorPiece
					key={selectedPiece.name}
					piece={selectedPiece}
					rotation={selectedPiece.rotation}
					flipped={selectedPiece.flipped}
					color={me?.color}
					initialPosition={cursorStart}
					cellSize={cursorCellSize}
				/>,
				document.body
			)}
			
			<Header
				screem={'gamne'}
				gameId={gameId}
				leaveDisabled={isQuitting}
				onCopyError={setLastMessage}
				onLeave={handleQuit}
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

				<PlayerRank
					currentUserId={me?.id}
					game={game}
					portraitComputer={isPortraitComputer}
				/>

				<Board
					board={board}
					onTileClick={handleTileClick}
					onBoardPointerMove={handleBoardPointerMove}
					onBoardLeave={clearHover}
					hoverCells={hoverCells}
					players={game.players}
					preview={{ color: me?.color, ability: selectedPiece?.ability }}
					lastMove={game.moveHistory.at(-1)}
				/>

				<PiecePanel
					canMove={canMove}
					onPieceClick={handlePieceClick}
					pieces={pieces}
					playablePieceNames={playablePieceNames}
					player={me}
					selectedPieceName={selectedPieceName}
					selectedPiece={selectedPiece}
					pieceCellSize={isPortraitComputer ? 20 : 14.5 * uiScale}
					portraitComputer={isPortraitComputer}
				/>
			</div>

			{notice}
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
