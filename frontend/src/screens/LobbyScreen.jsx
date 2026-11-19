import { useCallback, useEffect, useRef, useState } from 'react'
import { addLobbyBot, gameSocketUrl, getGame, leaveLobby, removeLobbyPlayer, 
	startLobbyGame, updateLobbyProfile, updateLobbySettings } from '../services/api'
import { enterLobby } from '../services/roomSession'
import { PLAYER_COLORS } from '../game/playerColors'
import Header from '../components/Header'
import BoardPreview from '../components/lobby/BoardPreview'
import PlayerRow from '../components/lobby/PlayerRow'
import TimerDial from '../components/lobby/TimerDial'
import '../styles/lobby.css'

const MAX_PLAYERS = 6

function clearRoomCredentials(gameId) {
	localStorage.removeItem(`tipto-player-${gameId}`)
	localStorage.removeItem(`tipto-admin-${gameId}`)
}

function LobbyScreen({ gameId, initialEntry, onLeave, onStarted, onRemoved, onRegisterLeave }) {
	const [game, setGame] = useState(initialEntry?.game ?? null)
	const [session, setSession] = useState(initialEntry?.credentials ?? null)
	const [playerName, setPlayerName] = useState(null)
	const [error, setError] = useState('')
	const [connected, setConnected] = useState(false)
	const [starting, setStarting] = useState(false)
	const [leaving, setLeaving] = useState(false)

	const entryRef = useRef(null)
	const revisionRef = useRef(-1)
	const removedRef = useRef(false)

	const me = game?.players.find(player => player.id === session?.playerId)
	const isHost = Boolean(me && me.id === game.adminPlayerId)
	const colorOptions = PLAYER_COLORS.map(option => ({
		...option,
		takenBy: game?.players.find(player =>
			player.id !== me?.id && !player.isBot && player.color === option.name
		)?.name ?? null,
	}))

	const startDisabledReason = (() => {
		if (!game) return ''
		if (game.players.length < 2) return 'At least 2 players are needed to start.'
		if (!connected) return 'Waiting for the room connection.'
		return ''
	})()
	const startDisabled = starting || Boolean(startDisabledReason)

	const removedFromRoom = useCallback(() => {
		if (removedRef.current) return
		removedRef.current = true
		clearRoomCredentials(gameId)
		onRemoved()
	}, [gameId, onRemoved])

	const receiveGame = useCallback((snapshot, credentials) => {
		if (snapshot.revision < revisionRef.current) return
		revisionRef.current = snapshot.revision
		const own = snapshot.players.find(player => player.id === credentials.playerId)
		if (!own) return removedFromRoom()
		setGame(snapshot)
		if (snapshot.status === 'playing' || snapshot.status === 'finished') {
			onStarted(gameId)
		}
	}, [gameId, onStarted, removedFromRoom])

	useEffect(() => {
		let active = true
		if (!entryRef.current) {
			entryRef.current = initialEntry ? Promise.resolve(initialEntry) : enterLobby(gameId)
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
	}, [gameId, initialEntry, receiveGame, removedFromRoom])

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

	const saveProfile = async changes => {
		setError('')
		const snapshot = await updateLobbyProfile(gameId, session, changes)
		receiveGame(snapshot, session)
	}

	const saveName = async () => {
		if (playerName === null) return
		const name = playerName.trim()
		if (!name) {
			setPlayerName(null)
			return
		}
		if (name !== me.name) await saveProfile({ name })
		// A response must not overwrite edits made while the save was pending.
		setPlayerName(current => current === playerName ? name : current)
	}

	const handleNameChange = event => {
		setPlayerName(event.target.value)
	}

	const handleNameBlur = () => {
		saveName().catch(nextError => setError(nextError.message))
	}

	const handleColourChange = color => {
		saveProfile({ color }).catch(nextError => setError(nextError.message))
	}

	const changeSettings = async changes => {
		setError('')
		try {
			receiveGame(await updateLobbySettings(gameId, session, {
				boardLayout: changes.boardLayout ?? game.settings.boardLayout,
				moveTimeLimitSeconds: Object.hasOwn(changes, 'moveTimeLimitSeconds') ? changes.moveTimeLimitSeconds : game.settings.moveTimeLimitSeconds
			}), session)
		} catch (nextError) {
			setError(nextError.message)
		}
	}

	const handleBoardChange = boardLayout => {
		return changeSettings({ boardLayout })
	}

	const managePlayers = async action => {
		setError('')
		try {
			receiveGame(await action(), session)
		} catch (nextError) {
			setError(nextError.message)
		}
	}

	const handleRemovePlayer = playerId => {
		return managePlayers(() => removeLobbyPlayer(gameId, session, playerId))
	}

	const startGame = async () => {
		if (!connected || starting || !game || game.players.length < 2) return
		setStarting(true)
		setError('')
		try {
			await saveName()
			receiveGame(await startLobbyGame(gameId, session), session)
		} catch (nextError) {
			setError(nextError.message)
			setStarting(false)
		}
	}

	const leaveRoom = useCallback(async () => {
		setLeaving(true)
		try {
			const credentials = session || (await entryRef.current)?.credentials
			if (credentials) {
				await leaveLobby(gameId, credentials)
			}
		} catch (nextError) {
			if (nextError.status !== 403 && nextError.status !== 404) {
				setError(nextError.message)
				setLeaving(false)
				return
			}
		}
		clearRoomCredentials(gameId)
		onLeave()
	}, [gameId, onLeave, session])

	useEffect(() => onRegisterLeave?.(leaveRoom), [leaveRoom, onRegisterLeave])

	return (
		<div className="lobbyScreen">
			<Header 
				screen={'lobby'}
				gameId={gameId} 
				onLeave={leaveRoom} 
				leaveDisabled={leaving || starting} 
				onCopyError={setError} 
			/>

			<main className="lobbyPage">
				{game && me ? <>
					<section className="lobbyPanel">
						<h2>Players</h2>
						<div className="lobbyPlayerList">
							{game.players.map(player => 
								<PlayerRow
									key={player.id}
									player={player}
									isYou={player.id === me.id}
									isHost={isHost}
									colorOptions={colorOptions}
									name={playerName ?? me.name}
									onNameChange={handleNameChange}
									onNameBlur={handleNameBlur}
									onColour={handleColourChange}
									onRemove={handleRemovePlayer}
								/>
							)}
						</div>
						{isHost && 
							<button 
								type="button" 
								className="lobbyAddBot" 
								disabled={!connected || starting || game.players.length >= MAX_PLAYERS} 
								onClick={() => managePlayers(() => addLobbyBot(gameId, session))}
							>
								+ Add bot
							</button>
						}
					</section>
					<div className="lobbyRightColumn">
						<section className="lobbyPanel">
							<h2>Game settings</h2>
							<h3>Board</h3>
							<BoardPreview
								boardLayout={game.settings.boardLayout}
								players={game.players}
								disabled={!isHost || !connected || starting}
								onChange={handleBoardChange}
							/>
							<div className="lobbyTimerSection">
								<h3>Turn timer</h3>
								<p>How long each player has to make a move. If time runs out, a piece is placed for them automatically.</p>
								<TimerDial
									value={game.settings.moveTimeLimitSeconds}
									readOnly={!isHost}
									disabled={!connected || starting}
									onChange={moveTimeLimitSeconds => changeSettings({moveTimeLimitSeconds})}
								/>
							</div>
						</section>
						{isHost && 
							<footer className="lobbyFooter" tabIndex={startDisabledReason ? 0 : undefined}>
								<button
									type="button"
									className="lobbyStart"
									onClick={startGame}
									disabled={startDisabled}
								>
									{starting ? 'Starting...' : 'Start game'}
									{starting && <span className="lobbyStartLoadingBar" />}
								</button>
								{startDisabledReason && 
									<span
										id="lobby-start-tooltip"
										className="lobbyStartTooltip"
										role="tooltip"
									>
										{startDisabledReason}
									</span>
								}
							</footer>
						}
					</div>
				</> : !error && 
					<div className="lobbyLoading" role="status">
						Joining room{'\u2026'}
					</div>
				}
				{error && 
					<div className="lobbyError" role="alert">
						{error}
					</div>
				}
			</main>
		</div>
	)
}

export default LobbyScreen
