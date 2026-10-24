import { useCallback, useEffect, useRef, useState } from 'react'
import {
	gameSocketUrl, getGame, leaveLobby, startLobbyGame, startLobbyGameWithBots,
	updateLobbyProfile, updateLobbySettings,
	addLobbyBot, removeLobbyPlayer,
} from '../services/api'
import { enterLobby } from '../services/roomSession'
import './LobbyScreen.css'

const COLOURS = [
	{ name: 'Purple', hex: '#8B5CF6' },
	{ name: 'Orange', hex: '#F97316' },
	{ name: 'Red', hex: '#EF4444' },
	{ name: 'Cyan', label: 'Teal', hex: '#14B8A6' },
	{ name: 'Blue', hex: '#3B82F6' },
	{ name: 'Yellow', hex: '#EAB308' },
	{ name: 'Pink', hex: '#EC4899' },
	{ name: 'Green', hex: '#22C55E' },
]
const BOARDS = [
	{ id: 'square', label: 'Classic', shape: ['#######', '#######', '#######', '#######', '#######', '#######', '#######'] },
	{ id: 'irregular', label: 'Irregular', shape: ['..###..', '.#####.', '#######', '#######', '.#####.', '..####.', '...##..'] },
	{ id: 'rooms', label: 'Rooms', shape: ['###.###', '###.###', '.#...#.', '.#####.', '...#...', '..###..', '..###..'] },
]
const TIMES = [null, 30, 60, 90]

function BoardShape({ layout }) {
	const board = BOARDS.find(board => board.id === layout) || BOARDS[1]
	return (
		<span className="lobbyBoardShape" aria-hidden="true">
			{board.shape.flatMap((row, rowIndex) => [...row].map((cell, columnIndex) => (
				<i
					key={`${rowIndex}-${columnIndex}`}
					className={cell === '#' ? 'lobbyBoardShapeCell' : undefined}
				/>
			)))}
		</span>
	)
}

function CopyIcon() {
	return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M16 8V4H4v12h4" /></svg>
}

function PencilIcon() {
	return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z" /><path d="m13.5 7 3.5 3.5" /></svg>
}

function formatInviteCode(code) {
	return `${code.slice(0, 3)} ${code.slice(3)}`.trim()
}

function LobbyScreen({ gameId, onLeave, onStarted, onRemoved }) {
	const [game, setGame] = useState(null)
	const [session, setSession] = useState(null)
	const [name, setName] = useState('')
	const [error, setError] = useState('')
	const [connected, setConnected] = useState(false)
	const [savingProfile, setSavingProfile] = useState(false)
	const [savingSettings, setSavingSettings] = useState(false)
	const [managingSeats, setManagingSeats] = useState(false)
	const [starting, setStarting] = useState(false)
	const [leaving, setLeaving] = useState(false)
	const [copied, setCopied] = useState(false)
	const entryRef = useRef(null)
	const nameTimerRef = useRef(null)
	const copyTimerRef = useRef(null)
	const nameDirtyRef = useRef(false)
	const latestNameRef = useRef('')
	const profileQueueRef = useRef(Promise.resolve())
	const profilePendingRef = useRef(0)
	const revisionRef = useRef(-1)
	const leavingRef = useRef(false)
	const removedRef = useRef(false)
	const me = game?.players.find(player => player.id === session?.playerId)
	const isHost = Boolean(me && me.id === game.adminPlayerId)
	const joined = game?.players.length || 0
	const target = game?.settings.playerCount || 4
	const remaining = target - joined
	const busy = !connected || leaving || starting || managingSeats

	const removedFromRoom = useCallback(() => {
		if (removedRef.current || leavingRef.current) return
		removedRef.current = true
		clearTimeout(nameTimerRef.current)
		localStorage.removeItem(`tipto-player-${gameId}`)
		localStorage.removeItem(`tipto-admin-${gameId}`)
		onRemoved()
	}, [gameId, onRemoved])

	const receiveGame = useCallback((snapshot, credentials) => {
		if (snapshot.revision < revisionRef.current) return
		revisionRef.current = snapshot.revision
		const ownPlayer = snapshot.players.find(player => player.id === credentials.playerId)
		if (!ownPlayer) {
			removedFromRoom()
			return
		}
		setGame(snapshot)
		if (!nameDirtyRef.current) {
			setName(ownPlayer.name)
			latestNameRef.current = ownPlayer.name
		}
		if (snapshot.status === 'playing' || snapshot.status === 'finished') onStarted(gameId)
	}, [gameId, onStarted, removedFromRoom])

	useEffect(() => {
		let active = true
		if (!entryRef.current) entryRef.current = enterLobby(gameId)
		entryRef.current.then(({ game, credentials }) => {
			if (!active) return
			setSession(credentials)
			receiveGame(game, credentials)
		}).catch(error => {
			if (!active) return
			if (error.message === 'You were removed from the room') removedFromRoom()
			else setError(error.message)
		})
		return () => { active = false }
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
				socket.send(JSON.stringify({ type: 'request_state' }))
			}
			socket.onmessage = event => {
				if (!active) return
				const message = JSON.parse(event.data)
				if (message.type === 'game_state') receiveGame(message.game, session)
				if (message.type === 'room_removed') removedFromRoom()
				if (message.type === 'error') setError(message.reason)
			}
			socket.onclose = async event => {
				if (!active) return
				if (removedRef.current) return
				setConnected(false)
				if (event.reason === 'You were removed from the room') {
					removedFromRoom()
					return
				}
				if (event.code === 1008) {
					setError('Your room session has ended. Leave and join again.')
					return
				}
				try {
					const snapshot = await getGame(gameId, session)
					if (active) receiveGame(snapshot, session)
				} catch (error) {
					if (!active) return
					if (error.message === 'You were removed from the room') {
						removedFromRoom()
						return
					}
				}
				if (active && !removedRef.current) retryTimer = setTimeout(connect, 1500)
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
		profilePendingRef.current += 1
		setSavingProfile(true)
		setError('')
		const update = profileQueueRef.current.then(async () => {
			try {
				const snapshot = await updateLobbyProfile(gameId, session, changes)
				if (changes.name === latestNameRef.current.trim()) nameDirtyRef.current = false
				receiveGame(snapshot, session)
			} catch (error) {
				setError(error.message)
				const snapshot = await getGame(gameId, session).catch(() => null)
				if (snapshot) receiveGame(snapshot, session)
			} finally {
				profilePendingRef.current -= 1
				setSavingProfile(profilePendingRef.current > 0)
			}
		})
		profileQueueRef.current = update.catch(() => {})
		return update
	}

	const changeName = event => {
		const nextName = event.target.value
		setName(nextName)
		latestNameRef.current = nextName
		nameDirtyRef.current = true
		clearTimeout(nameTimerRef.current)
		if (nextName.trim()) {
			nameTimerRef.current = setTimeout(() => saveProfile({ name: nextName.trim() }), 250)
		}
	}

	const flushName = async () => {
		clearTimeout(nameTimerRef.current)
		if (nameDirtyRef.current && latestNameRef.current.trim()) {
			await saveProfile({ name: latestNameRef.current.trim() })
		} else {
			await profileQueueRef.current
		}
	}

	const changeSettings = async changes => {
		setSavingSettings(true)
		setError('')
		try {
			const snapshot = await updateLobbySettings(gameId, session, { ...game.settings, ...changes })
			receiveGame(snapshot, session)
		} catch (error) {
			setError(error.message)
		} finally {
			setSavingSettings(false)
		}
	}

	const startGame = async () => {
		if (starting) return
		setStarting(true)
		setError('')
		try {
			await flushName()
			const snapshot = await (remaining > 0
				? startLobbyGameWithBots(gameId, session)
				: startLobbyGame(gameId, session))
			receiveGame(snapshot, session)
		} catch (error) {
			setError(error.message)
			setStarting(false)
		}
	}

	const leaveRoom = async () => {
		leavingRef.current = true
		setLeaving(true)
		clearTimeout(nameTimerRef.current)
		try {
			if (session && me) await leaveLobby(gameId, session)
			localStorage.removeItem(`tipto-player-${gameId}`)
			localStorage.removeItem(`tipto-admin-${gameId}`)
			onLeave()
		} catch (error) {
			if (error.status === 403 || error.status === 404) {
				localStorage.removeItem(`tipto-player-${gameId}`)
				localStorage.removeItem(`tipto-admin-${gameId}`)
				onLeave()
				return
			}
			setError(error.message)
			setLeaving(false)
			leavingRef.current = false
		}
	}

	const manageSeats = async action => {
		setManagingSeats(true)
		setError('')
		try {
			receiveGame(await action(), session)
		} catch (error) {
			setError(error.message)
		} finally {
			setManagingSeats(false)
		}
	}

	const copyInvite = async () => {
		try {
			await navigator.clipboard.writeText(gameId)
			setCopied(true)
			clearTimeout(copyTimerRef.current)
			copyTimerRef.current = setTimeout(() => setCopied(false), 1200)
		} catch {
			setError('Could not copy the invite code. Select and copy it manually.')
		}
	}

	const waitingText = remaining > 0
		? `Waiting for ${remaining} more`
		: "Everyone’s in"
	const handleNameBlur = () => {
		if (!latestNameRef.current.trim()) {
			nameDirtyRef.current = false
			setName(me.name)
			latestNameRef.current = me.name
		} else flushName()
	}

	return (
		<div className="lobbyScreen">

			<header className="lobbyTopBar">
				<div className="lobbyLogo"><span className="lobbyLogoMark" aria-hidden="true"><i /><i /><i /></span>Tipto</div>
				<button type="button" className="lobbyLeave" onClick={leaveRoom} disabled={leaving || starting}>Leave room</button>
			</header>

			<main className="lobbyPanel">

				<header className="lobbyHeader">
					<h1>Lobby</h1>
					<button type="button" className="lobbyCode" onClick={copyInvite} aria-label="Copy invite link">
						<strong>{formatInviteCode(gameId)}</strong>
						<span aria-hidden="true" />
						<CopyIcon />
						<em className={copied ? 'copied' : ''}>{copied ? 'Copied' : 'Copy'}</em>
					</button>
				</header>

				{game && me ?
					<>
					<section className="lobbyPlayers">
						<div className="lobbySectionHeading">
							<h2>Players</h2>
							<span className="lobbyCount">{joined} / {target}</span>
						</div>
						<div className="lobbySeats">
							{Array.from({ length: target }, (_, index) => {
								const player = game.players.find(player => player.settingsPlayerKey === `Player ${index + 1}`)
								const isYou = player?.id === me.id
								const isSeatHost = player?.id === game.adminPlayerId
								const colour = COLOURS.find(option => option.name === player?.color)?.hex
								const contents = player && <>
									<span className={`lobbySeatColour${player.color ? '' : ' lobbySeatColourUnassigned'}`} style={{ background: colour }} aria-hidden="true" />
									<span className="lobbySeatName" title={player.name}>{player.name}</span>
									{player.isBot && <span className="lobbySeatTag">Bot</span>}
									{isYou && <span className="lobbySeatTag">You</span>}
									{isYou && <PencilIcon />}
									{!isYou && isSeatHost && <span className="lobbySeatTag">Host</span>}
								</>

								if (isYou)
									return <div key={player.id} className="lobbySeat lobbyOwnSeat">
									{contents}
									{isHost && player.isBot && <button type="button" className="lobbyGhostButton" aria-label={`Remove ${player.name}`} disabled={busy} onClick={() => manageSeats(() => removeLobbyPlayer(gameId, session, player.id))}>×</button>}
								</div>

								if (player) return <div key={player.id} className="lobbySeat">
									{contents}
									{isHost && player.isBot && <button type="button" className="lobbyGhostButton" aria-label={`Remove ${player.name}`} disabled={busy} onClick={() => manageSeats(() => removeLobbyPlayer(gameId, session, player.id))}>×</button>}
								</div>

								return <div key={`empty-${index}`} className="lobbySeat lobbySeatEmpty">
									<span className="lobbySeatName">Waiting…</span>
									{isHost && <div className="lobbySeatActions">
										<button type="button" className="lobbyGhostButton" disabled={busy} onClick={() => manageSeats(() => addLobbyBot(gameId, session, index + 1))}>+ Bot</button>
										{target > 2 && <button type="button" className="lobbyGhostButton" aria-label={`Remove empty slot ${index + 1}`} disabled={busy || savingSettings} onClick={() => changeSettings({ playerCount: target - 1 })}>×</button>}
									</div>}
								</div>
							})}
							{isHost && target < 6 && <button type="button" className="lobbySeat lobbyAddSlot" disabled={busy || savingSettings} onClick={() => changeSettings({ playerCount: target + 1 })}>+ Add slot</button>}
						</div>

						<div className="lobbyProfileEditor">
							<label htmlFor="lobby-name">Name</label>
							<input id="lobby-name" value={name} maxLength={24} onChange={changeName} onBlur={handleNameBlur} disabled={busy} autoComplete="nickname" />
							<div className="lobbySwatches" role="group" aria-label="Colour">
								{COLOURS.map(colour => {
									const takenBy = game.players.find(player => player.id !== me.id && player.color === colour.name)
									return <button key={colour.name} type="button" className="lobbySwatch" style={{ '--lobby-swatch': colour.hex }} data-taken={takenBy ? '' : undefined} disabled={Boolean(takenBy) || busy || savingProfile} aria-pressed={me.color === colour.name} aria-label={`${colour.label || colour.name}${takenBy ? ` — taken by ${takenBy.name}` : ''}`} title={takenBy ? `Taken by ${takenBy.name}` : colour.label || colour.name} onClick={() => saveProfile({ color: colour.name })} />
								})}
							</div>
						</div>
					</section>

					<section className="lobbySettings">
						<h2>Game settings</h2>
						{isHost ? <>
							<div className="lobbySettingRow">
								<span>Board</span>
								<div className="lobbySegments lobbyBoardSegments" role="group" aria-label="Board layout">
									{BOARDS.map(board => <button type="button" key={board.id} aria-pressed={game.settings.boardLayout === board.id} disabled={busy || savingSettings} onClick={() => changeSettings({ boardLayout: board.id })}><BoardShape layout={board.id} /><span>{board.label}</span></button>)}
								</div>
							</div>
							<div className="lobbySettingRow">
								<span>Timer</span>
								<div className="lobbySegments" role="group" aria-label="Time per move">
									{TIMES.map(time => <button type="button" key={time ?? 'none'} aria-pressed={game.settings.moveTimeLimitSeconds === time} disabled={busy || savingSettings} onClick={() => changeSettings({ moveTimeLimitSeconds: time })}>{time === null ? 'None' : `${time}s`}</button>)}
								</div>
							</div>
						</> : <>
							<div className="lobbyPills">
								<span><BoardShape layout={game.settings.boardLayout} />{BOARDS.find(board => board.id === game.settings.boardLayout)?.label}</span>
								<span>Players <b>{target}</b></span>
								<span>Timer <b>{game.settings.moveTimeLimitSeconds === null ? 'None' : `${game.settings.moveTimeLimitSeconds}s`}</b></span>
							</div>
						</>}
					</section>

					<footer className="lobbyFooter">
						<span role="status">{connected ? (isHost ? waitingText : 'Waiting for host to start…') : 'Reconnecting…'}</span>
						{isHost && <button type="button" className="lobbyStart" onClick={startGame} aria-busy={starting}>{starting ? 'Starting…' : remaining > 0 ? `Start with ${remaining} bot${remaining === 1 ? '' : 's'}` : 'Start game'}</button>}
					</footer>
					</>
				:
					!error && <div className="lobbyLoading" role="status">Joining room…</div>
				}
				{error && <div className="lobbyError" role="alert">{error}</div>}
			</main>
		</div>
	)
}

export default LobbyScreen
