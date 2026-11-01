import { useCallback, useEffect, useRef, useState } from 'react'
import HomeScreen from '../screens/HomeScreen'
import LobbyScreen from '../screens/LobbyScreen'
import GameScreen from '../screens/GameScreen'
import BackgroundPieces from '../components/background/BackgroundPieces'
import { createGame, wakeGameServer } from '../services/api'
import { enterLobby } from '../services/roomSession'
import { createRoomNavigation } from './roomNavigation'
import usePhoneLayout from '../hooks/usePhoneLayout'
import '../styles/phone-layout.css'

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

function PhoneRotateOverlay() {
	return <div className="phoneRotateOverlay phoneRotatePortrait" role="status">
		<svg viewBox="0 0 64 64" aria-hidden="true">
			<rect x={20} y={10} width={24} height={44} rx="4" />
			<path d="M11 24A23 23 0 0 1 31 4M11 24l-5-7m5 7 8-3" />
		</svg>
		<span>Rotate your phone upright to continue</span>
	</div>
}

function App() {
	const phoneMode = usePhoneLayout()
	const [path, setPath] = useState(window.location.pathname)
	const [entryError, setEntryError] = useState('')
	const [enteringAction, setEnteringAction] = useState(null)
	const enteringRef = useRef(false)
	const navigationRef = useRef(null)
	const leaveHandlerRef = useRef(null)
	const route = getRouteFromPath(path)
	const hasGameSession = route.screen === 'game' && Boolean(localStorage.getItem(`tipto-player-${route.gameId}`))

	const isPhoneGame = phoneMode === 'portrait'

	useEffect(() => {
		wakeGameServer().catch(() => {})
	}, [])

	//Setup browser navigation handling
	useEffect(() => {
		const navigation = createRoomNavigation(window, setPath, () => leaveHandlerRef.current)
		navigationRef.current = navigation
		return () => navigation.dispose()
	}, [])

	//Prevents scrolling on the phone
	useEffect(() => {
		const className = 'phoneViewportLocked'
		const isPhone = phoneMode !== 'desktop'

		document.documentElement.classList.toggle(className, isPhone)

		return () => document.documentElement.classList.remove(className)
	}, [phoneMode])


	const navigateTo = useCallback(nextPath => { navigationRef.current?.navigateTo(nextPath) }, [])

	const registerLeave = useCallback(handler => {
		leaveHandlerRef.current = handler
		return () => { if (leaveHandlerRef.current === handler) leaveHandlerRef.current = null }
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
			setEnteringAction(null)
		}
	}

	if (phoneMode === 'landscape') return <PhoneRotateOverlay />

	if (!hasGameSession) {
		return (
			<div className="pregameShell">
				<BackgroundPieces className="pregameBackground" topCollisionSelector={route.screen === 'lobby' ? '.lobbyTopBar' : undefined} />
				{route.screen === 'home' ? (
					<HomeScreen
						onEnterGame={handleEnterRoom}
						onConfigureGame={() => handleEnterRoom()}
						actionError={entryError}
						enteringAction={enteringAction}
					/>
				) : (
					<LobbyScreen
						key={route.gameId}
						gameId={route.gameId}
						onLeave={handleLeaveRoom}
						onStarted={handleStartPlaying}
						onRemoved={handleRemoved}
						onRegisterLeave={registerLeave}
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
			isPhoneGame={isPhoneGame}
			onRegisterLeave={registerLeave}
		/>
	)
}

export default App
