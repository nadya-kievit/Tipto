import { useCallback, useEffect, useRef, useState } from 'react'
import {
	gameSocketUrl, getGame, leaveLobby, startLobbyGame,
	updateLobbyProfile, updateLobbySettings,
	addLobbyBot, fillLobbyBots, removeLobbyPlayer,
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
const PLAYER_COUNTS = [2, 3, 4, 5, 6]
const TIMES = [null, 30, 60, 90]

function BoardShape({ layout, small = false }) {
	const board = BOARDS.find(board => board.id === layout) || BOARDS[1]
	return (
		<span className={`lobbyBoardShape${small ? ' lobbyBoardShapeSmall' : ''}`} aria-hidden="true">
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

function RobotIcon() {
	return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3M8 16h8" /><rect x="5" y="6" width="14" height="14" rx="1" /><path d="M3 10v6M21 10v6M9 10v2M15 10v2" /></svg>
}

function PhoneLobby({
	gameId, game, me, name, onNameChange, onNameBlur, saveProfile, changeSettings,
	leaveRoom, copyInvite, copied, isHost, joined, target, remaining, busy,
	savingProfile, savingSettings, starting, startGame, connected, waitingText,
	manageSeats, session, error,
}) {
	return <div className="lobbyScreen phoneLandscape">
		<header className="phoneLobbyBar">
			<div><span>Invite</span><strong>{gameId}</strong><button type="button" onClick={copyInvite}><CopyIcon />{copied ? 'Copied' : 'Copy'}</button></div>
			<button type="button" className="phoneLobbyLeave" onClick={leaveRoom} disabled={busy}>Leave</button>
		</header>
		{game && me ? <main className="phoneLobbyMain">
			<section className="phoneLobbyLeft">
				<h2>You</h2>
				<label htmlFor="phone-lobby-name">Name</label>
				<input id="phone-lobby-name" value={name} maxLength={24} onChange={onNameChange} onBlur={onNameBlur} disabled={busy} autoComplete="nickname" />
				<div className="phoneLobbySwatches" role="group" aria-label="Colour">
					{COLOURS.map(colour => {
						const takenBy = game.players.find(player => player.id !== me.id && player.color === colour.name)
						return <button key={colour.name} type="button" style={{ '--lobby-swatch': colour.hex }} className={`${me.color === colour.name ? 'selected ' : ''}${takenBy ? 'taken' : ''}`} disabled={Boolean(takenBy) || busy || savingProfile} aria-label={colour.label || colour.name} onClick={() => saveProfile({ color: colour.name })} />
					})}
				</div>
				<div className="phoneLobbyPlayersHeading"><h2>Players <span>{joined}/{target}</span></h2>{isHost && remaining > 0 && <button type="button" disabled={busy || savingSettings} onClick={() => manageSeats(() => fillLobbyBots(gameId, session))}><RobotIcon />Fill with bots</button>}</div>
				<div className="phoneLobbySeats">
					{Array.from({ length: target }, (_, index) => {
						const player = game.players.find(player => player.settingsPlayerKey === `Player ${index + 1}`)
						const isYou = player?.id === me.id
						return <div key={player?.id || `empty-${index}`} className={player ? '' : 'empty'}>
							{player ? <><i style={{ background: COLOURS.find(colour => colour.name === player.color)?.hex }} /><span title={player.name}>{isYou ? `${player.name} (you)` : player.name}</span>{isHost && !isYou && <button type="button" aria-label={`Remove ${player.name}`} disabled={busy || savingSettings} onClick={() => manageSeats(() => removeLobbyPlayer(gameId, session, player.id))}>×</button>}</> : <><span>Waiting…</span>{isHost && <button type="button" disabled={busy || savingSettings} onClick={() => manageSeats(() => addLobbyBot(gameId, session, index + 1))}>+ Bot</button>}</>}
						</div>
					})}
				</div>
			</section>
			<section className="phoneLobbyRight">
				<div><h2>Board</h2><div className="phoneLobbyBoards" role="group" aria-label="Board layout">{BOARDS.map(board => <button type="button" key={board.id} aria-pressed={game.settings.boardLayout === board.id} disabled={!isHost || busy || savingSettings} onClick={() => changeSettings({ boardLayout: board.id })}><BoardShape layout={board.id} /><span>{board.label}</span></button>)}</div></div>
				<div className="phoneLobbySettingGroups"><h2>Players · time per move</h2><div><div className="lobbySegments">{PLAYER_COUNTS.map(count => <button type="button" key={count} aria-pressed={target === count} disabled={!isHost || count < joined || busy || savingSettings} onClick={() => changeSettings({ playerCount: count })}>{count}</button>)}</div><div className="lobbySegments">{TIMES.map(time => <button type="button" key={time ?? 'none'} aria-pressed={game.settings.moveTimeLimitSeconds === time} disabled={!isHost || busy || savingSettings} onClick={() => changeSettings({ moveTimeLimitSeconds: time })}>{time === null ? 'None' : `${time}s`}</button>)}</div></div></div>
				<footer><span role="status">{connected ? waitingText : 'Reconnecting…'}</span>{isHost && <button type="button" onClick={startGame} disabled={joined !== target || busy || savingSettings || savingProfile}>{starting ? 'Starting…' : 'Start game'}</button>}</footer>
			</section>
			{error && <div className="phoneLobbyError" role="alert">{error}</div>}
		</main> : <div className="phoneLobbyLoading" role="status">Joining room…</div>}
	</div>
}

function LobbyScreen({ gameId, onLeave, onStarted, onRemoved, isPhoneLandscape = false }) {
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
	const nameDirtyRef = useRef(false)
	const latestNameRef = useRef('')
	const profileQueueRef = useRef(Promise.resolve())
	const profilePendingRef = useRef(0)
	const revisionRef = useRef(-1)
	const leavingRef = useRef(false)
	const removedRef = useRef(false)
	const me = game?.players.find(player => player.id === session?.playerId)
	const host = game?.players.find(player => player.id === game.adminPlayerId)
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

	useEffect(() => () => clearTimeout(nameTimerRef.current), [])

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
		setStarting(true)
		setError('')
		try {
			await flushName()
			const snapshot = await startLobbyGame(gameId, session)
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
		} catch {
			setError('Could not copy the invite code. Select and copy it manually.')
		}
	}

	const waitingText = remaining > 0
		? `Waiting for ${remaining} more player${remaining === 1 ? '' : 's'}`
		: isHost ? "Everyone’s here" : `Everyone’s here. Waiting for ${host?.name || 'the host'} to start the game.`
	const handleNameBlur = () => {
		if (!latestNameRef.current.trim()) {
			nameDirtyRef.current = false
			setName(me.name)
			latestNameRef.current = me.name
		} else flushName()
	}

	if (isPhoneLandscape) return <PhoneLobby {...{
		gameId, game, me, name, saveProfile, changeSettings, leaveRoom, copyInvite, copied,
		isHost, joined, target, remaining, busy, savingProfile, savingSettings, starting,
		startGame, connected, waitingText, manageSeats, session, error,
	}} onNameChange={changeName} onNameBlur={handleNameBlur} />

	return (
		<div className="lobbyScreen">
			<header className="lobbyTopBar">
				<div className="lobbyLogo"><span className="lobbyLogoMark" aria-hidden="true"><i /><i /><i /></span>Tipto</div>
				<button type="button" className="lobbyLeave" onClick={leaveRoom} disabled={leaving || starting}>Leave room</button>
			</header>
			<main className="lobbyMain">
				<div className="lobbyPanel">
					<section className="lobbySection lobbyInviteSection">
						<div><h1 className="lobbySectionLabel">Invite code</h1><div className="lobbyInviteCode">{gameId}</div></div>
						<button type="button" className="lobbyCopy" onClick={copyInvite}><CopyIcon />{copied ? 'Copied' : 'Copy invite'}</button>
					</section>
					{game && me ? <>
						<section className="lobbySection">
							<h2 className="lobbySectionLabel">You</h2>
							<label className="lobbyFieldLabel" htmlFor="lobby-name">Name</label>
							<input id="lobby-name" className="lobbyName" value={name} maxLength={24} onChange={changeName} onBlur={handleNameBlur} disabled={busy} autoComplete="nickname" />
							<div className="lobbyFieldLabel lobbyColourLabel" id="lobby-colour-label">Colour</div>
							<div className="lobbySwatches" role="group" aria-labelledby="lobby-colour-label">
								{COLOURS.map(colour => {
									const takenBy = game.players.find(player => player.id !== me.id && player.color === colour.name)
									return <button key={colour.name} type="button" className={`lobbySwatch${me.color === colour.name ? ' lobbySwatchSelected' : ''}${takenBy ? ' lobbySwatchTaken' : ''}`} style={{ '--lobby-swatch': colour.hex }} disabled={Boolean(takenBy) || busy || savingProfile} aria-pressed={me.color === colour.name} aria-label={`${colour.label || colour.name}${takenBy ? ` — taken by ${takenBy.name}` : ''}`} title={takenBy ? `Taken by ${takenBy.name}` : colour.label || colour.name} onClick={() => saveProfile({ color: colour.name })}>{takenBy && <span aria-hidden="true">✕</span>}</button>
								})}
							</div>
						</section>
						<section className="lobbySection">
							<div className="lobbySectionHeading lobbyPlayersHeading">
								<h2 className="lobbySectionLabel">Players</h2>
								<div className="lobbyRosterActions">
									<span className="lobbyJoinedCount">{joined} / {target} joined</span>
									{isHost && remaining > 0 && <button type="button" className="lobbyFillBots" disabled={busy || savingSettings} onClick={() => manageSeats(() => fillLobbyBots(gameId, session))}><RobotIcon />Fill with bots</button>}
								</div>
							</div>
							<div className="lobbySeats">
								{Array.from({ length: target }, (_, index) => {
									const player = game.players.find(player => player.settingsPlayerKey === `Player ${index + 1}`)
									const isYou = player?.id === me.id
									const isSeatHost = player?.id === game.adminPlayerId
									const tag = player?.isBot ? 'Bot' : isYou && isSeatHost ? 'You · Host' : isYou ? 'You' : isSeatHost ? 'Host' : null
									return <div key={player?.id || `empty-${index}`} className={`lobbySeat${player ? '' : ' lobbySeatEmpty'}`}>
										{player ? <>
											<span className={`lobbySeatColour${player.color ? '' : ' lobbySeatColourUnassigned'}`} style={{ background: COLOURS.find(colour => colour.name === player.color)?.hex }} title={player.color ? undefined : 'Colour assigned when the game starts'} aria-hidden="true" />
											<span className="lobbySeatName" title={player.name}>{player.name}</span>
											{tag && <span className="lobbySeatTag">{tag}</span>}
											{isHost && !isYou && <button type="button" className="lobbyRemovePlayer" aria-label={`Remove ${player.name}`} disabled={busy || savingSettings} onClick={() => manageSeats(() => removeLobbyPlayer(gameId, session, player.id))}>×</button>}
										</> : <>
											<span className="lobbySeatName">Waiting…</span>
											{isHost && <button type="button" className="lobbyAddBot" disabled={busy || savingSettings} onClick={() => manageSeats(() => addLobbyBot(gameId, session, index + 1))}>Add bot</button>}
										</>}
									</div>
								})}
							</div>
						</section>
						<section className="lobbySection">
							<div className="lobbySectionHeading"><h2 className="lobbySectionLabel">Game settings</h2>{isHost && <span className="lobbyHostNote">Host only</span>}</div>
							{isHost ? <>
								<div className="lobbyFieldLabel">Board</div>
								<div className="lobbyBoardOptions" role="group" aria-label="Board layout">
									{BOARDS.map(board => <button type="button" key={board.id} aria-pressed={game.settings.boardLayout === board.id} disabled={busy || savingSettings} className={`lobbyBoardOption${game.settings.boardLayout === board.id ? ' lobbyBoardOptionSelected' : ''}`} onClick={() => changeSettings({ boardLayout: board.id })}><BoardShape layout={board.id} /><span>{board.label}</span></button>)}
								</div>
								<div className="lobbySettingsRow">
									<div><div className="lobbyFieldLabel">Players</div><div className="lobbySegments" role="group" aria-label="Number of players">{PLAYER_COUNTS.map(count => <button type="button" key={count} aria-pressed={target === count} disabled={count < joined || busy || savingSettings} title={count < joined ? 'Cannot be below the number already joined' : undefined} onClick={() => changeSettings({ playerCount: count })}>{count}</button>)}</div></div>
									<div><div className="lobbyFieldLabel">Time per move</div><div className="lobbySegments" role="group" aria-label="Time per move">{TIMES.map(time => <button type="button" key={time ?? 'none'} aria-pressed={game.settings.moveTimeLimitSeconds === time} disabled={busy || savingSettings} onClick={() => changeSettings({ moveTimeLimitSeconds: time })}>{time === null ? 'None' : `${time}s`}</button>)}</div></div>
								</div>
							</> : <>
								<div className="lobbyReadOnlySettings"><BoardShape layout={game.settings.boardLayout} small /><span>{BOARDS.find(board => board.id === game.settings.boardLayout)?.label} board · <span className="lobbyNumber">{target}</span> players · {game.settings.moveTimeLimitSeconds === null ? 'No time limit' : <><span className="lobbyNumber">{game.settings.moveTimeLimitSeconds}s</span> per move</>}</span></div>
								<div className="lobbySetBy">Set by {host?.name || 'the host'} (host)</div>
							</>}
						</section>
						<footer className="lobbySection lobbyFooter">
							<span className="lobbyStatus" role="status">{connected ? waitingText : 'Reconnecting…'}</span>
							{isHost && <button type="button" className="lobbyStart" onClick={startGame} disabled={joined !== target || busy || savingSettings || savingProfile}>{starting ? 'Starting…' : 'Start game'}</button>}
						</footer>
					</> : !error && <div className="lobbySection lobbyStatus" role="status">Joining room…</div>}
					{error && <div className="lobbySection lobbyError" role="alert">{error}</div>}
				</div>
			</main>
		</div>
	)
}

export default LobbyScreen
