import { useCallback, useEffect, useRef, useState } from 'react'
import { addLobbyBot, gameSocketUrl, getGame, leaveLobby, removeLobbyPlayer, startLobbyGame, updateLobbyProfile, updateLobbySettings } from '../services/api'
import { enterLobby } from '../services/roomSession'
import { getPlayerColorHex, PLAYER_COLORS } from '../playerColors'
import './LobbyScreen.css'

const BOARDS = [
	{ id: 'square', label: 'Classic', shape: ['#######', '#######', '#######', '#######', '#######', '#######', '#######'] },
	{ id: 'irregular', label: 'Irregular', shape: ['..###..', '.#####.', '#######', '#######', '.#####.', '..####.', '...##..'] },
	{ id: 'rooms', label: 'Rooms', shape: ['###.###', '###.###', '.#...#.', '.#####.', '...#...', '..###..', '..###..'] },
]
const L_SHAPES = [[[0, 0], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0]], [[0, 0], [0, 1], [1, 1]], [[0, 1], [1, 0], [1, 1]]]
const MAX_PLAYERS = 6
const TIMER_MIN = 30
const TIMER_MAX = 90
const DIAL_CX = 110
const DIAL_CY = 110
const DIAL_RADIUS = 70
const DIAL_START = 135
const DIAL_SWEEP = 270

function CopyIcon({ copied }) {
	return <span className="lobbyCopyIcons" aria-hidden="true"><svg className={copied ? 'hidden' : ''} viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M16 8V4H4v12h4" /></svg><svg className={copied ? '' : 'hidden'} viewBox="0 0 24 24"><path d="m5 12 4 4 10-10" /></svg></span>
}
function GridIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><rect x="14" y="14" width="6" height="6" /></svg> }
function ClockIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg> }
function RobotIcon() {
	return <svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M12 7V4M10 2h4" />
		<rect x="4" y="7" width="16" height="13" rx="3" />
		<path d="M4 11H2v5h2M20 11h2v5h-2M9 17h6" />
		<circle className="robotEye" cx="9" cy="13" r="1.25" />
		<circle className="robotEye" cx="15" cy="13" r="1.25" />
	</svg>
}

function previewPieces(board, players) {
	const occupied = new Set(), result = new Map()
	for (const player of players) {
		let best = null
		for (const shape of L_SHAPES) for (let row = 0; row < 7; row++) for (let col = 0; col < 7; col++) {
			const cells = shape.map(([dr, dc]) => [row + dr, col + dc])
			if (cells.some(([r, c]) => r > 6 || c > 6 || board.shape[r][c] !== '#' || occupied.has(`${r}-${c}`))) continue
			const centre = cells.reduce((sum, [r, c]) => sum + (r - 3) ** 2 + (c - 3) ** 2, 0)
			const distances = cells.flatMap(([r, c]) => [...occupied].map(key => { const [or, oc] = key.split('-').map(Number); return (r - or) ** 2 + (c - oc) ** 2 }))
			const nearest = distances.length ? Math.min(...distances) : centre
			const total = distances.length ? distances.reduce((sum, distance) => sum + distance, 0) : centre
			if (!best || nearest > best.nearest || (nearest === best.nearest && total > best.total)) best = { cells, nearest, total }
		}
		if (best) for (const [row, col] of best.cells) { const key = `${row}-${col}`; occupied.add(key); result.set(key, getPlayerColorHex(player.color)) }
	}
	return result
}

function BoardPreview({ board, players, selected }) {
	const pieces = selected ? previewPieces(board, players) : new Map()
	return <span className="lobbyBoardPreview" aria-hidden="true">{board.shape.flatMap((row, r) => [...row].map((cell, c) => { const color = pieces.get(`${r}-${c}`); return <i key={`${r}-${c}`} className={cell === '#' ? 'playable' : ''} style={color ? { '--preview-player': color } : undefined} data-sample={color ? '' : undefined} /> }))}</span>
}

function polar(angle, radius = DIAL_RADIUS) { const radians = angle * Math.PI / 180; return { x: DIAL_CX + Math.cos(radians) * radius, y: DIAL_CY + Math.sin(radians) * radius } }
function timerAngle(value) { return DIAL_START + (value - TIMER_MIN) / (TIMER_MAX - TIMER_MIN) * DIAL_SWEEP }
function arcPath(endAngle) { const start = polar(DIAL_START), end = polar(endAngle), sweep = endAngle - DIAL_START; return `M ${start.x} ${start.y} A ${DIAL_RADIUS} ${DIAL_RADIUS} 0 ${sweep > 180 ? 1 : 0} 1 ${end.x} ${end.y}` }
function timerFromPointer(event, element, requireRing = true) {
	const bounds = element.getBoundingClientRect(), x = (event.clientX - bounds.left) * 220 / bounds.width, y = (event.clientY - bounds.top) * 205 / bounds.height
	const dx = x - DIAL_CX, dy = y - DIAL_CY
	if (requireRing && Math.abs(Math.hypot(dx, dy) - DIAL_RADIUS) > 24) return null
	let angle = Math.atan2(dy, dx) * 180 / Math.PI
	if (angle < 0) angle += 360
	let progress
	if (angle > 45 && angle < 135) progress = angle < 90 ? 1 : 0
	else { if (angle < DIAL_START) angle += 360; progress = Math.max(0, Math.min(1, (angle - DIAL_START) / DIAL_SWEEP)) }
	return Math.round((TIMER_MIN + progress * (TIMER_MAX - TIMER_MIN)) / 5) * 5
}

function TimerDial({ value, readOnly, disabled, saving, onChange }) {
	const [draft, setDraft] = useState(null), [optimisticValue, setOptimisticValue] = useState(undefined), [dragging, setDragging] = useState(false), [ghostValue, setGhostValue] = useState(null), [lastValue, setLastValue] = useState(value ?? 60)
	const faceRef = useRef(null), effectiveValue = draft ?? (optimisticValue !== undefined ? optimisticValue : value), shown = effectiveValue ?? lastValue, noLimit = effectiveValue === null, inactive = readOnly || disabled || noLimit
	const save = next => {
		if (next !== null) setLastValue(next)
		setOptimisticValue(next)
		return Promise.resolve().then(() => onChange(next)).finally(() => setOptimisticValue(current => Object.is(current, next) ? undefined : current))
	}
	const beginDrag = event => {
		if (inactive || (event.pointerType === 'touch' && !event.target.classList.contains('dialKnobHitTarget'))) return
		const next = timerFromPointer(event, faceRef.current)
		if (next === null) return
		faceRef.current.setPointerCapture(event.pointerId)
		setDragging(true)
		setDraft(next)
	}
	const commit = event => { if (!dragging) return; const next = timerFromPointer(event, faceRef.current, false); setDragging(false); setDraft(null); if (next !== null) save(next) }
	const keyDown = event => {
		if (inactive) return
		const changes = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -15, PageUp: 15 }
		let next = shown
		if (event.key === 'Home') next = 30; else if (event.key === 'End') next = 90; else if (changes[event.key]) next += changes[event.key]; else return
		event.preventDefault(); next = Math.max(30, Math.min(90, next)); save(next)
	}
	const knob = polar(timerAngle(shown)), ghost = ghostValue === null ? null : polar(timerAngle(ghostValue))
	return <div className="lobbyTimerControls"><div className={`lobbyTimerDial${noLimit ? ' noLimit' : ''}${readOnly ? ' readOnly' : ''}`}><div ref={faceRef} className="lobbyDialFace" role="slider" tabIndex={inactive ? -1 : 0} aria-label="Turn timer" aria-valuemin="30" aria-valuemax="90" aria-valuenow={noLimit ? undefined : shown} aria-valuetext={noLimit ? 'No limit' : `${shown} seconds`} aria-disabled={inactive} onKeyDown={keyDown}
		onPointerDown={beginDrag}
		onPointerMove={event => { if (inactive || (event.pointerType === 'touch' && !dragging)) return; const next = timerFromPointer(event, faceRef.current, !dragging); setGhostValue(event.pointerType === 'touch' ? null : next); if (dragging && next !== null) setDraft(next) }} onPointerUp={commit} onPointerCancel={() => { setDragging(false); setDraft(null) }} onPointerLeave={() => !dragging && setGhostValue(null)}>
		<svg viewBox="0 0 220 205" aria-hidden="true"><path className="dialTrack" d={arcPath(405)} /><path className="dialFill" d={arcPath(timerAngle(shown))} />{Array.from({ length: 13 }, (_, index) => { const tick = 30 + index * 5, angle = timerAngle(tick), inside = polar(angle, 80), outside = polar(angle, index % 6 === 0 ? 91 : 86); return <line key={tick} className={index % 6 === 0 ? 'major' : ''} x1={inside.x} y1={inside.y} x2={outside.x} y2={outside.y} /> })}{ghost && <circle className="dialGhost" cx={ghost.x} cy={ghost.y} r="10" />}<circle className="dialKnob" cx={knob.x} cy={knob.y} r="10" /><circle className="dialKnobHitTarget" cx={knob.x} cy={knob.y} r="16" /></svg>
		{[30, 60, 90].map(timer => { const point = polar(timerAngle(timer), 102); return <span key={timer} className="dialLabel" style={{ left: Math.round(point.x), top: Math.round(point.y) }}>{timer}</span> })}<div className="dialValue"><strong>{noLimit ? '∞' : shown}</strong><span>{noLimit ? 'no limit' : 'sec'}</span></div></div></div>
		<label className="lobbyNoLimit"><span>No limit</span><input type="checkbox" checked={noLimit} disabled={readOnly || disabled} data-saving-settings={saving || undefined} onChange={event => { if (event.target.checked && effectiveValue !== null) setLastValue(effectiveValue); save(event.target.checked ? null : lastValue) }} /><i aria-hidden="true"><b /></i></label></div>
}

function PlayerRow({ player, isYou, isHost, players, name, busy, managingPlayers, savingProfile, onNameChange, onNameBlur, onColour, onRemove }) {
	return <div className={`lobbyPlayerRow${isYou ? ' own' : ''}`} style={{ '--player-colour': getPlayerColorHex(player.color) }}><span className={`lobbyPlayerTile${player.isBot ? ' bot' : ''}`} aria-hidden="true">{player.isBot && <RobotIcon />}</span>{isYou ? <div className="lobbyOwnProfile"><input aria-label="Name" value={name} maxLength={24} onChange={onNameChange} onBlur={onNameBlur} disabled={busy} data-managing-players={managingPlayers || undefined} autoComplete="nickname" /><div className="lobbySwatches" role="group" aria-label="Colour">{PLAYER_COLORS.map(option => { const takenBy = players.find(other => other.id !== player.id && !other.isBot && other.color === option.name), selected = player.color === option.name; return <button key={option.name} type="button" className="lobbySwatch" style={{ '--swatch': option.hex }} disabled={Boolean(takenBy) || busy || savingProfile} data-managing-players={managingPlayers || undefined} data-taken={takenBy ? '' : undefined} aria-pressed={selected} aria-label={`${option.name}${takenBy ? ` — taken by ${takenBy.name}` : ''}`} title={takenBy ? `Taken by ${takenBy.name}` : option.name} onClick={() => onColour(option.name)}>{selected ? <span aria-hidden="true">✓</span> : takenBy ? <span aria-hidden="true">{takenBy.name.charAt(0).toUpperCase()}</span> : null}</button> })}</div></div> : <span className="lobbyPlayerName" title={player.name}>{player.name}</span>}{player.isBot && isHost && <button type="button" className="lobbyRemoveBot" aria-label={`Remove ${player.name}`} disabled={busy} onClick={onRemove}>×</button>}</div>
}

function LobbyScreen({ gameId, onLeave, onStarted, onRemoved }) {
	const [game, setGame] = useState(null), [session, setSession] = useState(null), [name, setName] = useState(''), [error, setError] = useState(''), [connected, setConnected] = useState(false)
	const [savingProfile, setSavingProfile] = useState(false), [savingSettings, setSavingSettings] = useState(false), [managingPlayers, setManagingPlayers] = useState(false), [starting, setStarting] = useState(false), [leaving, setLeaving] = useState(false), [copied, setCopied] = useState(false)
	const entryRef = useRef(null), nameTimerRef = useRef(null), copyTimerRef = useRef(null), nameDirtyRef = useRef(false), latestNameRef = useRef(''), profileQueueRef = useRef(Promise.resolve()), profilePendingRef = useRef(0), revisionRef = useRef(-1), leavingRef = useRef(false), removedRef = useRef(false)
	const me = game?.players.find(player => player.id === session?.playerId), isHost = Boolean(me && me.id === game.adminPlayerId), busy = !connected || leaving || starting || managingPlayers
	const startDisabled = Boolean(game && (busy || savingSettings || game.players.length < 2))
	const startDisabledReason = game?.players.length < 2 ? 'At least 2 players are needed to start.' : !connected ? 'Waiting for the room connection.' : leaving ? 'Leaving the room.' : starting ? 'The game is starting.' : managingPlayers ? 'Updating the player list.' : savingSettings ? 'Saving game settings.' : ''
	const removedFromRoom = useCallback(() => { if (removedRef.current || leavingRef.current) return; removedRef.current = true; clearTimeout(nameTimerRef.current); localStorage.removeItem(`tipto-player-${gameId}`); localStorage.removeItem(`tipto-admin-${gameId}`); onRemoved() }, [gameId, onRemoved])
	const receiveGame = useCallback((snapshot, credentials) => { if (snapshot.revision < revisionRef.current) return; revisionRef.current = snapshot.revision; const own = snapshot.players.find(player => player.id === credentials.playerId); if (!own) return removedFromRoom(); setGame(snapshot); if (!nameDirtyRef.current) { setName(own.name); latestNameRef.current = own.name } if (snapshot.status === 'playing' || snapshot.status === 'finished') onStarted(gameId) }, [gameId, onStarted, removedFromRoom])

	useEffect(() => { let active = true; if (!entryRef.current) entryRef.current = enterLobby(gameId); entryRef.current.then(({ game: snapshot, credentials }) => { if (!active) return; setSession(credentials); receiveGame(snapshot, credentials) }).catch(nextError => { if (!active) return; if (nextError.message === 'You were removed from the room') removedFromRoom(); else setError(nextError.message) }); return () => { active = false } }, [gameId, receiveGame, removedFromRoom])
	useEffect(() => { if (!session) return; let active = true, socket, retryTimer; const connect = () => { socket = new WebSocket(gameSocketUrl(gameId, session)); socket.onopen = () => { if (!active) return; setConnected(true); socket.send(JSON.stringify({ type: 'request_state' })) }; socket.onmessage = event => { const message = JSON.parse(event.data); if (message.type === 'game_state') receiveGame(message.game, session); if (message.type === 'room_removed') removedFromRoom(); if (message.type === 'error') setError(message.reason) }; socket.onclose = async event => { if (!active || removedRef.current) return; setConnected(false); if (event.reason === 'You were removed from the room') return removedFromRoom(); if (event.code === 1008) return setError('Your room session has ended. Leave and join again.'); try { const snapshot = await getGame(gameId, session); if (active) receiveGame(snapshot, session) } catch (nextError) { if (nextError.message === 'You were removed from the room') return removedFromRoom() } if (active && !removedRef.current) retryTimer = setTimeout(connect, 1500) } }; connect(); return () => { active = false; clearTimeout(retryTimer); socket.close() } }, [gameId, session, receiveGame, removedFromRoom])
	useEffect(() => () => { clearTimeout(nameTimerRef.current); clearTimeout(copyTimerRef.current) }, [])

	const saveProfile = changes => { profilePendingRef.current += 1; setSavingProfile(true); setError(''); const update = profileQueueRef.current.then(async () => { try { const snapshot = await updateLobbyProfile(gameId, session, changes); if (changes.name === latestNameRef.current.trim()) nameDirtyRef.current = false; receiveGame(snapshot, session) } catch (nextError) { setError(nextError.message); const snapshot = await getGame(gameId, session).catch(() => null); if (snapshot) receiveGame(snapshot, session) } finally { profilePendingRef.current -= 1; setSavingProfile(profilePendingRef.current > 0) } }); profileQueueRef.current = update.catch(() => {}); return update }
	const changeName = event => { const next = event.target.value; setName(next); latestNameRef.current = next; nameDirtyRef.current = true; clearTimeout(nameTimerRef.current); if (next.trim()) nameTimerRef.current = setTimeout(() => saveProfile({ name: next.trim() }), 250) }
	const flushName = async () => { clearTimeout(nameTimerRef.current); if (nameDirtyRef.current && latestNameRef.current.trim()) await saveProfile({ name: latestNameRef.current.trim() }); else await profileQueueRef.current }
	const changeSettings = async changes => { setSavingSettings(true); setError(''); try { receiveGame(await updateLobbySettings(gameId, session, { boardLayout: changes.boardLayout ?? game.settings.boardLayout, moveTimeLimitSeconds: Object.hasOwn(changes, 'moveTimeLimitSeconds') ? changes.moveTimeLimitSeconds : game.settings.moveTimeLimitSeconds }), session) } catch (nextError) { setError(nextError.message) } finally { setSavingSettings(false) } }
	const managePlayers = async action => { setManagingPlayers(true); setError(''); try { receiveGame(await action(), session) } catch (nextError) { setError(nextError.message) } finally { setManagingPlayers(false) } }
	const startGame = async () => { if (starting || !game || game.players.length < 2) return; setStarting(true); setError(''); try { await flushName(); receiveGame(await startLobbyGame(gameId, session), session) } catch (nextError) { setError(nextError.message); setStarting(false) } }
	const leaveRoom = async () => { leavingRef.current = true; setLeaving(true); clearTimeout(nameTimerRef.current); try { if (session && me) await leaveLobby(gameId, session); localStorage.removeItem(`tipto-player-${gameId}`); localStorage.removeItem(`tipto-admin-${gameId}`); onLeave() } catch (nextError) { if (nextError.status === 403 || nextError.status === 404) { localStorage.removeItem(`tipto-player-${gameId}`); localStorage.removeItem(`tipto-admin-${gameId}`); return onLeave() } setError(nextError.message); setLeaving(false); leavingRef.current = false } }
	const copyInvite = async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); clearTimeout(copyTimerRef.current); copyTimerRef.current = setTimeout(() => setCopied(false), 1800) } catch { setError('Could not copy the invite link.') } }
	const handleNameBlur = () => { if (!latestNameRef.current.trim()) { nameDirtyRef.current = false; setName(me.name); latestNameRef.current = me.name } else flushName() }

	return <div className="lobbyScreen"><header className="lobbyTopBar"><div className="lobbyTopBarLeft"><div className="lobbyLogo"><span className="lobbyLogoMark" aria-hidden="true"><i /><i /><i /></span>Tipto</div><span className="lobbyTopBarDivider" aria-hidden="true" /><h1>Lobby</h1></div><div className="lobbyTopBarRight"><div className="lobbyInvite"><div className="lobbyRoomCode"><span>Room code</span><strong>{`${gameId.slice(0, 3)} ${gameId.slice(3)}`.trim()}</strong></div><button type="button" className={copied ? 'copied' : ''} onClick={copyInvite} aria-label="Copy invite link"><CopyIcon copied={copied} /><span>{copied ? 'Link copied' : 'Copy invite link'}</span></button></div><button type="button" className="lobbyLeave" onClick={leaveRoom} disabled={leaving || starting}>Leave room</button></div></header><main className="lobbyPage">
	{game && me ? <><section className="lobbyPanel lobbyPlayersPanel"><h2>Players</h2><div className="lobbyPlayerList">{game.players.map(player => <PlayerRow key={player.id} player={player} isYou={player.id === me.id} isHost={isHost} players={game.players} name={name} busy={busy} managingPlayers={managingPlayers} savingProfile={savingProfile} onNameChange={changeName} onNameBlur={handleNameBlur} onColour={color => saveProfile({ color })} onRemove={() => managePlayers(() => removeLobbyPlayer(gameId, session, player.id))} />)}</div>{isHost && <button type="button" className="lobbyAddBot" disabled={busy || game.players.length >= MAX_PLAYERS} onClick={() => managePlayers(() => addLobbyBot(gameId, session))}>+ Add bot</button>}</section>
	<div className="lobbyRightColumn"><section className="lobbyPanel lobbySettingsPanel"><h2>Game settings</h2><div className="lobbySettingHeading"><GridIcon /><span>Board</span></div><div className="lobbyBoardCards" role="group" aria-label="Board layout">{BOARDS.map(board => { const selected = game.settings.boardLayout === board.id; return <button type="button" key={board.id} className={selected ? 'selected' : ''} aria-pressed={selected} disabled={!isHost || busy || savingSettings} onClick={() => changeSettings({ boardLayout: board.id })}><BoardPreview board={board} players={game.players} selected={selected} /><span>{board.label}</span></button> })}</div><div className="lobbyTimerSection"><div className="lobbySettingHeading"><ClockIcon /><div><span>Turn timer</span><p>How long each player has to make a move. If time runs out, a piece is placed for them automatically.</p></div></div><TimerDial value={game.settings.moveTimeLimitSeconds} readOnly={!isHost} disabled={busy || savingSettings} saving={savingSettings} onChange={moveTimeLimitSeconds => changeSettings({ moveTimeLimitSeconds })} /></div></section>
	<footer className="lobbyFooter">{isHost && <span className="lobbyStartControl" tabIndex={startDisabled ? 0 : undefined} aria-describedby={startDisabled ? 'lobby-start-tooltip' : undefined}><button type="button" className="lobbyStart" onClick={startGame} disabled={startDisabled} data-saving-settings={savingSettings || undefined} aria-busy={starting} aria-describedby={startDisabled ? 'lobby-start-tooltip' : undefined}>{starting ? 'Starting…' : 'Start game'}</button>{startDisabled && <span id="lobby-start-tooltip" className="lobbyStartTooltip" role="tooltip">{startDisabledReason}</span>}</span>}</footer></div></> : !error && <div className="lobbyLoading" role="status">Joining room…</div>}{error && <div className="lobbyError" role="alert">{error}</div>}</main></div>
}

export default LobbyScreen
