import { useCallback, useEffect, useRef, useState } from 'react'
import CreateGameScreen from './screens/CreateGameScreen'
import LobbyScreen from './screens/LobbyScreen'
import GameScreen from './screens/GameScreen'
import BackgroundPieces from './components/BackgroundPieces'
import { createGame } from './services/api'
import { enterLobby } from './services/roomSession'
import usePhoneLayout from './hooks/usePhoneLayout'
import './screens/PhoneLayout.css'

function getRouteFromPath(pathname) {
	const roomMatch = pathname.match(/^\/(lobby|game)\/([^/]+)$/)
	return roomMatch
		? { screen: roomMatch[1], gameId: roomMatch[2] }
		: { screen: 'home', gameId: null }
}

function getEntryErrorMessage(error, action) {
	if (!navigator.onLine) return 'You’re offline. Reconnect to the internet and try again.'

	const isNetworkError = error instanceof TypeError
		|| /failed to fetch|load failed|network request failed|networkerror/i.test(error?.message || '')

	if (isNetworkError) {
		return action === 'create'
			? 'Couldn’t start the game. Check your connection and try again.'
			: 'Couldn’t join the game. Check your connection and try again.'
	}

	if (action === 'join' && error?.status === 404) {
		return 'We couldn’t find a game with that code.'
	}

	return error?.message || 'Something went wrong. Please try again.'
}

function PhoneRotateOverlay({ orientation }) {
	const isLandscape = orientation === 'landscape'
	return <div className={`phoneRotateOverlay phoneRotate${isLandscape ? 'Landscape' : 'Portrait'}`} role="status">
		<svg viewBox="0 0 64 64" aria-hidden="true">
			<rect x={isLandscape ? 10 : 20} y={isLandscape ? 20 : 10} width={isLandscape ? 44 : 24} height={isLandscape ? 24 : 44} rx="4" />
			<path d="M11 24A23 23 0 0 1 31 4M11 24l-5-7m5 7 8-3" />
		</svg>
		<span>Rotate your phone {isLandscape ? 'to play' : 'upright to continue'}</span>
	</div>
}

function App() {
	const phoneMode = usePhoneLayout()
	const [path, setPath] = useState(window.location.pathname)
	const [entryError, setEntryError] = useState('')
	const [isEntering, setIsEntering] = useState(false)
	const [enteringAction, setEnteringAction] = useState(null)
	const enteringRef = useRef(false)
	const route = getRouteFromPath(path)
	const hasGameSession = route.screen === 'game' && Boolean(localStorage.getItem(`tipto-player-${route.gameId}`))

	const isPhoneLandscape = phoneMode === 'landscape'

	useEffect(() => {
		const handlePopState = () => setPath(window.location.pathname)
		window.addEventListener('popstate', handlePopState)
		return () => window.removeEventListener('popstate', handlePopState)
	}, [])

	const navigateTo = useCallback(nextPath => {
		if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath)
		setPath(nextPath)
	}, [])
	const handleLeaveRoom = useCallback(() => navigateTo('/'), [navigateTo])
	const handleRemoved = useCallback(() => {
		setEntryError('You were removed from the room')
		navigateTo('/')
	}, [navigateTo])
	const handleStartPlaying = useCallback(gameId => navigateTo(`/game/${gameId}`), [navigateTo])
	const handleNeedsSession = useCallback(() => navigateTo(`/lobby/${route.gameId}`), [navigateTo, route.gameId])

	const handleEnterRoom = async gameId => {
		if (enteringRef.current) return
		const action = gameId ? 'join' : 'create'
		enteringRef.current = true
		setIsEntering(true)
		setEnteringAction(action)
		setEntryError('')
		try {
			let roomId = gameId
			if (!roomId) {
				const room = await createGame({
					lobbyMode: true,
					boardLayout: 'irregular',
					playerCount: 4,
					moveTimeLimitSeconds: 60,
				})
				roomId = room.gameId
				localStorage.setItem(`tipto-admin-${roomId}`, room.adminToken)
			}
			const { game } = await enterLobby(roomId)
			navigateTo(`/${game.status === 'waiting' ? 'lobby' : 'game'}/${roomId}`)
		} catch (error) {
			setEntryError(getEntryErrorMessage(error, action))
		} finally {
			enteringRef.current = false
			setIsEntering(false)
			setEnteringAction(null)
		}
	}

	if (hasGameSession && phoneMode === 'portrait') return <PhoneRotateOverlay orientation="landscape" />
	if (!hasGameSession && phoneMode === 'landscape') return <PhoneRotateOverlay orientation="portrait" />

	if (!hasGameSession) {
		return (
			<div className="pregameShell">
				<BackgroundPieces className="pregameBackground" />
				{route.screen === 'home' ? (
					<CreateGameScreen
						isPhoneLandscape={isPhoneLandscape}
						onEnterGame={handleEnterRoom}
						onConfigureGame={() => handleEnterRoom()}
						actionError={entryError}
						isEntering={isEntering}
						enteringAction={enteringAction}
					/>
				) : (
					<LobbyScreen
						key={route.gameId}
						gameId={route.gameId}
						onLeave={handleLeaveRoom}
						onStarted={handleStartPlaying}
						onRemoved={handleRemoved}
					/>
				)}
			</div>
		)
	}

	return (
		<GameScreen
			key={route.gameId}
			gameId={route.gameId}
			onLeaveGame={handleLeaveRoom}
			onNeedsColor={handleNeedsSession}
			isPhoneLandscape={isPhoneLandscape}
		/>
	)
}

export default App
