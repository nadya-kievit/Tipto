import { useCallback, useEffect, useRef, useState } from 'react'
import {
	addLobbyBot,
	gameSocketUrl,
	getGame,
	leaveLobby,
	removeLobbyPlayer,
	startLobbyGame,
	updateLobbyProfile,
	updateLobbySettings,
} from '../services/api'
import { enterLobby } from '../services/roomSession'
import BoardPreview from '../components/lobby/BoardPreview'
import PlayerRow from '../components/lobby/PlayerRow'
import TimerDial from '../components/lobby/TimerDial'
import '../styles/lobby.css'

const BOARDS = [
	{
		id: 'square',
		label: 'Classic',
		shape: ['#######', '#######', '#######', '#######', '#######', '#######', '#######'],
	},
	{
		id: 'irregular',
		label: 'Irregular',
		shape: ['..###..', '.#####.', '#######', '#######', '.#####.', '..####.', '...##..'],
	},
	{
		id: 'rooms',
		label: 'Rooms',
		shape: ['###.###', '###.###', '.#...#.', '.#####.', '...#...', '..###..', '..###..'],
	},
]

const MAX_PLAYERS = 6

function clearRoomCredentials(gameId) {
	localStorage.removeItem(`tipto-player-${gameId}`)
	localStorage.removeItem(`tipto-admin-${gameId}`)
}

function CopyIcon({ copied }) {
	return (
		<span className="lobbyCopyIcons" aria-hidden="true">
			<svg className={copied ? 'hidden' : ''} viewBox="0 0 24 24">
				<rect x="8" y="8" width="12" height="12" rx="1" />
				<path d="M16 8V4H4v12h4" />
			</svg>
			<svg className={copied ? '' : 'hidden'} viewBox="0 0 24 24">
				<path d="m5 12 4 4 10-10" />
			</svg>
		</span>
	)
}

function GridIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<rect x="4" y="4" width="6" height="6" />
			<rect x="14" y="4" width="6" height="6" />
			<rect x="4" y="14" width="6" height="6" />
			<rect x="14" y="14" width="6" height="6" />
		</svg>
	)
}

function ClockIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="8" />
			<path d="M12 7v5l3 2" />
		</svg>
	)
}

function LobbyScreen({ gameId, onLeave, onStarted, onRemoved, onRegisterLeave }) {
	const [game, setGame] = useState(null)
	const [session, setSession] = useState(null)
	const [name, setName] = useState('')
	const [error, setError] = useState('')
	const [connected, setConnected] = useState(false)
	const [pendingProfileCount, setPendingProfileCount] = useState(0)
	const [savingSettings, setSavingSettings] = useState(false)
	const [managingPlayers, setManagingPlayers] = useState(false)
	const [starting, setStarting] = useState(false)
	const [leaving, setLeaving] = useState(false)
	const [copied, setCopied] = useState(false)

	const entryRef = useRef(null)
	const nameTimerRef = useRef(null)
	const copyTimerRef = useRef(null)
	const nameDirtyRef = useRef(false)
	const latestNameRef = useRef('')
	const profileQueueRef = useRef(Promise.resolve())
	const revisionRef = useRef(-1)
	const leavingRef = useRef(false)
	const removedRef = useRef(false)

	const me = game?.players.find(player => player.id === session?.playerId)
	const isHost = Boolean(me && me.id === game.adminPlayerId)
	const savingProfile = pendingProfileCount > 0
	const busy = !connected || leaving || starting || managingPlayers

	const getStartDisabledReason = () => {
		if (!game) return ''
		if (game.players.length < 2) return 'At least 2 players are needed to start.'
		if (!connected) return 'Waiting for the room connection.'
		if (leaving) return 'Leaving the room.'
		if (starting) return 'The game is starting.'
		if (managingPlayers) return 'Updating the player list.'
		if (savingSettings) return 'Saving game settings.'
		return ''
	}

	const startDisabledReason = getStartDisabledReason()
	const startDisabled = Boolean(startDisabledReason)

	const removedFromRoom = useCallback(() => {
		if (removedRef.current || leavingRef.current) return
		removedRef.current = true
		clearTimeout(nameTimerRef.current)
		clearRoomCredentials(gameId)
		onRemoved()
	}, [gameId, onRemoved])

	const receiveGame = useCallback((snapshot, credentials) => {
		if (snapshot.revision < revisionRef.current) return
		revisionRef.current = snapshot.revision
		const own = snapshot.players.find(player => player.id === credentials.playerId)
		if (!own) return removedFromRoom()
		setGame(snapshot)
		if (!nameDirtyRef.current) {
			setName(own.name)
			latestNameRef.current = own.name
		}
		if (snapshot.status === 'playing' || snapshot.status === 'finished') {
			onStarted(gameId)
		}
	}, [gameId, onStarted, removedFromRoom])

	useEffect(() => {
		let active = true
		if (!entryRef.current) {
			entryRef.current = enterLobby(gameId)
		}
		entryRef.current.then(({
			game: snapshot,
			credentials
		}) => {
			if (!active) return
			setSession(credentials)
			receiveGame(snapshot, credentials)
		}).catch(nextError => {
			if (!active) return
			if (nextError.message === 'You were removed from the room') {
				removedFromRoom()
			} else {
				setError(nextError.message)
			}
		})
		return () => {
			active = false
		}
	}, [gameId, receiveGame, removedFromRoom])

	useEffect(() => {
		if (!session) return
		let active = true
		let socket
		let retryTimer
		const connect = () => {
			socket = new WebSocket(gameSocketUrl(gameId, session))
			socket.onopen = () => {
				if (!active) return
				setConnected(true)
			}
			socket.onmessage = event => {
				const message = JSON.parse(event.data)
				if (message.type === 'game_state') {
					receiveGame(message.game, session)
				}
				if (message.type === 'room_removed') {
					removedFromRoom()
				}
				if (message.type === 'error') {
					setError(message.reason)
				}
			}
			socket.onclose = async event => {
				if (!active || removedRef.current) return
				setConnected(false)
				if (event.reason === 'You were removed from the room') return removedFromRoom()
				if (event.code === 1008) return setError('Your room session has ended. Leave and join again.')
				try {
					const snapshot = await getGame(gameId, session)
					if (active) {
						receiveGame(snapshot, session)
					}
				} catch (nextError) {
					if (nextError.message === 'You were removed from the room') return removedFromRoom()
				}
				if (active && !removedRef.current) {
					retryTimer = setTimeout(connect, 1500)
				}
			}
		}
		connect()
		return () => {
			active = false
			clearTimeout(retryTimer)
			socket.close()
		}
	}, [gameId, session, receiveGame, removedFromRoom])

	useEffect(() => () => {
		clearTimeout(nameTimerRef.current)
		clearTimeout(copyTimerRef.current)
	}, [])

	const saveProfile = changes => {
		setPendingProfileCount(count => count + 1)
		setError('')
		const update = profileQueueRef.current.then(async () => {
			try {
				const snapshot = await updateLobbyProfile(gameId, session, changes)
				if (changes.name === latestNameRef.current.trim()) {
					nameDirtyRef.current = false
				}
				receiveGame(snapshot, session)
			} catch (nextError) {
				setError(nextError.message)
				const snapshot = await getGame(gameId, session).catch(() => null)
				if (snapshot) {
					receiveGame(snapshot, session)
				}
			} finally {
				setPendingProfileCount(count => count - 1)
			}
		})
		profileQueueRef.current = update.catch(() => {})
		return update
	}

	const changeName = event => {
		const next = event.target.value
		setName(next)
		latestNameRef.current = next
		nameDirtyRef.current = true
		clearTimeout(nameTimerRef.current)
		if (next.trim()) {
			nameTimerRef.current = setTimeout(() => saveProfile({
				name: next.trim()
			}), 250)
		}
	}

	const flushName = async () => {
		clearTimeout(nameTimerRef.current)
		if (nameDirtyRef.current && latestNameRef.current.trim()) {
			await saveProfile({
				name: latestNameRef.current.trim()
			})
		} else {
			await profileQueueRef.current
		}
	}

	const changeSettings = async changes => {
		setSavingSettings(true)
		setError('')
		try {
			receiveGame(await updateLobbySettings(gameId, session, {
				boardLayout: changes.boardLayout ?? game.settings.boardLayout,
				moveTimeLimitSeconds: Object.hasOwn(changes, 'moveTimeLimitSeconds') ? changes.moveTimeLimitSeconds : game.settings.moveTimeLimitSeconds
			}), session)
		} catch (nextError) {
			setError(nextError.message)
		} finally {
			setSavingSettings(false)
		}
	}

	const managePlayers = async action => {
		setManagingPlayers(true)
		setError('')
		try {
			receiveGame(await action(), session)
		} catch (nextError) {
			setError(nextError.message)
		} finally {
			setManagingPlayers(false)
		}
	}

	const startGame = async () => {
		if (starting || !game || game.players.length < 2) return
		setStarting(true)
		setError('')
		try {
			await flushName()
			receiveGame(await startLobbyGame(gameId, session), session)
		} catch (nextError) {
			setError(nextError.message)
			setStarting(false)
		}
	}

	const leaveRoom = useCallback(async () => {
		if (leavingRef.current) return
		leavingRef.current = true
		setLeaving(true)
		clearTimeout(nameTimerRef.current)
		try {
			const credentials = session || (await entryRef.current)?.credentials
			if (credentials) {
				await leaveLobby(gameId, credentials)
			}
		} catch (nextError) {
			if (nextError.status !== 403 && nextError.status !== 404) {
				setError(nextError.message)
				setLeaving(false)
				leavingRef.current = false
				return
			}
		}
		clearRoomCredentials(gameId)
		onLeave()
	}, [gameId, onLeave, session])

	useEffect(() => onRegisterLeave?.(leaveRoom), [leaveRoom, onRegisterLeave])
	const copyInvite = async () => {
		try {
			await navigator.clipboard.writeText(window.location.href)
			setCopied(true)
			clearTimeout(copyTimerRef.current)
			copyTimerRef.current = setTimeout(() => setCopied(false), 1800)
		} catch {
			setError('Could not copy the invite link.')
		}
	}

	const handleNameBlur = () => {
		if (!latestNameRef.current.trim()) {
			nameDirtyRef.current = false
			setName(me.name)
			latestNameRef.current = me.name
		} else {
			flushName()
		}
	}
	return (
		<div className="lobbyScreen">
			<header className="lobbyTopBar">
				<div className="lobbyTopBarLeft">
					<div className="lobbyLogo">
						<span className="lobbyLogoMark" aria-hidden="true">
							<i />
							<i />
							<i />
						</span>
					Tipto
					</div>
					<span className="lobbyTopBarDivider" aria-hidden="true" />
					<h1>Lobby</h1>
				</div>
				<div className="lobbyTopBarRight">
					<div className="lobbyInvite">
						<div className="lobbyRoomCode">
							<span>Room code</span>
							<strong>
								{`${gameId.slice(0, 3)} ${gameId.slice(3)}`.trim()}
							</strong>
						</div>
						<button
							type="button"
							className={copied ? 'copied' : ''}
							onClick={copyInvite}
							aria-label="Copy invite link"
						>
							<CopyIcon copied={copied} />
							<span>
								{copied ? 'Link copied' : 'Copy invite link'}
							</span>
						</button>
					</div>
					<button
						type="button"
						className="lobbyLeave"
						onClick={leaveRoom}
						disabled={leaving || starting}
					>Leave room</button>
				</div>
			</header>

			<main className="lobbyPage">
				{game && me ? <>
					<section className="lobbyPanel lobbyPlayersPanel">
						<h2>Players</h2>
						<div className="lobbyPlayerList">
							{game.players.map(player => <PlayerRow
								key={player.id}
								player={player}
								isYou={player.id === me.id}
								isHost={isHost}
								players={game.players}
								name={name}
								busy={busy}
								managingPlayers={managingPlayers}
								savingProfile={savingProfile}
								onNameChange={changeName}
								onNameBlur={handleNameBlur}
								onColour={color => saveProfile({
									color
								})}
								onRemove={() => managePlayers(() => removeLobbyPlayer(gameId, session, player.id))}
							/>)}
						</div>
						{isHost && <button
							type="button"
							className="lobbyAddBot"
							disabled={busy || game.players.length >= MAX_PLAYERS}
							onClick={() => managePlayers(() => addLobbyBot(gameId, session))}
						>+ Add bot</button>}
					</section>
					<div className="lobbyRightColumn">
						<section className="lobbyPanel lobbySettingsPanel">
							<h2>Game settings</h2>
							<div className="lobbySettingHeading">
								<GridIcon />
								<span>Board</span>
							</div>
							<div
								className="lobbyBoardCards"
								role="group"
								aria-label="Board layout"
							>
								{BOARDS.map(board => {
									const selected = game.settings.boardLayout === board.id
									return (
										<button
											type="button"
											key={board.id}
											className={selected ? 'selected' : ''}
											aria-pressed={selected}
											disabled={!isHost || busy || savingSettings}
											onClick={() => changeSettings({
												boardLayout: board.id
											})}
										>
											<BoardPreview
												board={board}
												players={game.players}
												selected={selected}
											/>
											<span>
												{board.label}
											</span>
										</button>
									)
								})}
							</div>
							<div className="lobbyTimerSection">
								<div className="lobbySettingHeading">
									<ClockIcon />
									<div>
										<span>Turn timer</span>
										<p>How long each player has to make a move. If time runs out, a piece is placed for them automatically.</p>
									</div>
								</div>
								<TimerDial
									value={game.settings.moveTimeLimitSeconds}
									readOnly={!isHost}
									disabled={busy || savingSettings}
									saving={savingSettings}
									onChange={moveTimeLimitSeconds => changeSettings({
										moveTimeLimitSeconds
									})}
								/>
							</div>
						</section>
						<footer className="lobbyFooter">
							{isHost && <span
								className="lobbyStartControl"
								tabIndex={startDisabled ? 0 : undefined}
								aria-describedby={startDisabled ? 'lobby-start-tooltip' : undefined}
							>
								<button
									type="button"
									className="lobbyStart"
									onClick={startGame}
									disabled={startDisabled}
									data-saving-settings={savingSettings || undefined}
									aria-busy={starting}
									aria-describedby={startDisabled ? 'lobby-start-tooltip' : undefined}
								>
									{starting ? 'Startingâ€¦' : 'Start game'}
								</button>
								{startDisabled && <span
									id="lobby-start-tooltip"
									className="lobbyStartTooltip"
									role="tooltip"
								>
									{startDisabledReason}
								</span>}
							</span>}
						</footer>
					</div>
				</> : !error && <div className="lobbyLoading" role="status">Joining roomâ€¦</div>}
				{error && <div className="lobbyError" role="alert">
					{error}
				</div>}
			</main>
		</div>
	)
}

export default LobbyScreen
