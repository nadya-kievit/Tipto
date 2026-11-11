import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { copyText } from '../../../services/clipboard'
import { displayCells, tileFinish } from '../../../game/piecePresentation'
import { getPlayerColorHex } from '../../../game/playerColors'
import { phoneFit, playableBounds } from '../../../game/phoneGeometry'
import usePhoneDrag from './usePhoneDrag'

const score = player => player.pieces.reduce((sum, piece) => sum + (piece.placed ? piece.cells.length : 0), 0)

function PhoneTimer({ endsAt, limit }) {
 const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
 useEffect(() => {
  const interval = setInterval(() => setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))), 250)
  return () => clearInterval(interval)
 }, [endsAt])
 return <><span className="phoneTimerTrack"><i style={{ width: `${limit ? Math.min(100, remaining / limit * 100) : 100}%` }} /></span><span className="phoneTime">{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</span></>
}

function Icon({ kind }) {
 return <svg viewBox="0 0 24 24" aria-hidden="true">{kind === 'people' ? <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.6" /><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8" /></> : kind === 'menu' ? <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></> : kind === 'left' ? <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" /> : kind === 'right' ? <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /> : kind === 'flip' ? <path d="M12 3v18M8 7 3 12l5 5V7zM16 7l5 5-5 5V7z" /> : kind === 'copy' ? <><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M16 8V4H4v12h4" /></> : <path d="m6 9 6 6 6-6" />}</svg>
}

// Tray and opponent previews share the existing compact tile finishes.
function PhonePieceShape({ piece, cellSize, color, gap = 1 }) {
 if (!piece) return null
 const cells = displayCells(piece.cells, piece.rotation, piece.flipped)
 const columns = Math.max(...cells.map(([, col]) => col)) + 1
 const rows = Math.max(...cells.map(([row]) => row)) + 1
 const size = cellSize
 const spacing = Math.round(gap)
 return <span className="shape" aria-hidden="true" style={{ width: columns * size + (columns - 1) * spacing, height: rows * size + (rows - 1) * spacing }}>
  {cells.map(([row, col], index) => <i key={index} style={{ width: size, height: size, top: row * (size + spacing), left: col * (size + spacing), borderRadius: 1, ...tileFinish(color, piece.ability, 'tray') }} />)}
 </span>
}

// Native tray scrolling, with a larger hit area for the custom scrollbar.
function ScrollBar({ targetRef, label, count }) {
 const [scroll, setScroll] = useState({ fraction: 1, position: 0 })
 const grab = useRef(null)
 useLayoutEffect(() => {
  const target = targetRef.current
  const update = () => setScroll({ fraction: target.clientWidth / target.scrollWidth, position: target.scrollLeft / target.scrollWidth })
  update()
  const observer = new ResizeObserver(update)
  observer.observe(target)
  Array.from(target.children).forEach(child => observer.observe(child))
  target.addEventListener('scroll', update)
  return () => { observer.disconnect(); target.removeEventListener('scroll', update) }
 }, [targetRef, count])
 const move = event => {
  if (!grab.current) return
  const target = targetRef.current
  const rect = event.currentTarget.getBoundingClientRect()
  target.scrollLeft = (event.clientX - rect.left - grab.current.offset) / rect.width * target.scrollWidth
 }
 return <div className="sbar trayBar" role="slider" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(scroll.position / (1 - scroll.fraction || 1) * 100)} tabIndex={0} hidden={scroll.fraction >= .999}
  onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const el = targetRef.current; el.scrollLeft = event.key === 'Home' ? 0 : event.key === 'End' ? el.scrollWidth : el.scrollLeft + (event.key === 'ArrowRight' ? 1 : -1) * el.clientWidth / 2 } }}
  onPointerDown={event => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const thumb = event.currentTarget.firstElementChild.getBoundingClientRect(); grab.current = { offset: event.clientX >= thumb.left && event.clientX <= thumb.right ? event.clientX - thumb.left : rect.width * scroll.fraction / 2 }; event.currentTarget.setPointerCapture(event.pointerId); move(event) }}
  onPointerMove={move} onPointerUp={() => { grab.current = null }} onPointerCancel={() => { grab.current = null }} onLostPointerCapture={() => { grab.current = null }}>
  <i style={{ width: `${scroll.fraction * 100}%`, left: `${scroll.position * 100}%` }} />
 </div>
}


function Logo() {
 return <i className="logo" aria-hidden="true"><b /><b /><b /><b /></i>
}

export default function PhoneGameLayout({ game, me, board, canMove, pieces, pendingPlacement,
 onStage, onRotate, onFlip, onPlace, onQuit, isQuitting, onCopyError, notice }) {
 const rootRef = useRef(null), trayRef = useRef(null)
 const [overlay, setOverlay] = useState(null), [expanded, setExpanded] = useState(null)
 const [copied, setCopied] = useState(false)
 const [metrics, setMetrics] = useState({ cell: 1, tray: 11 })
 const bounds = playableBounds(board)
 const { row, col, rows, cols } = bounds
 useLayoutEffect(() => {
  const root = rootRef.current
  const fit = () => {
   const bottom = parseFloat(getComputedStyle(root.querySelector('.trayZone')).paddingBottom)
   const next = phoneFit(root.clientWidth, root.clientHeight, { rows, cols }, bottom)
   setMetrics(old => old.cell === next.cell && old.tray === next.tray ? old : next)
  }
  fit()
  const observer = new ResizeObserver(fit)
  observer.observe(root)
  return () => observer.disconnect()
 }, [rows, cols])
 useEffect(() => {
  const close = e => {
   if (e.type === 'keydown' && e.key !== 'Escape') return
   if (e.type === 'keydown' || !e.target.closest('.top')) { setOverlay(null); setExpanded(null) }
  }
  document.addEventListener('pointerdown', close)
  document.addEventListener('keydown', close)
  return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
 }, [])
 const color = getPlayerColorHex(me.color)
 usePhoneDrag(rootRef, { game, me, board, canMove, pieces, pendingPlacement, bounds, metrics, color,
  onStage, onRotate, onFlip, onPlace, closeOverlays: () => { setOverlay(null); setExpanded(null) } })
 const current = game.players.find(p => p.id === game.currentPlayerId)
 const players = [...game.players].sort((a, b) => score(b) - score(a))
 const remaining = pieces.filter(p => !p.placed)
 const abilities = new Map(game.players.flatMap(player => player.pieces.filter(p => p.placed && p.ability).map(p => [`${player.id}-${p.name}`, p.ability])))
 const starts = new Map(game.players.filter(p => p.startPosition).map(p => [`${p.startPosition.row},${p.startPosition.col}`, p]))
 const pendingCells = new Set(pendingPlacement?.cells.map(c => `${c.row},${c.col}`) || [])
 const roomCode = game.inviteCode || game.gameId
 const copyRoom = async () => {
  try { await copyText(roomCode); setCopied(true) } catch { setCopied(false); onCopyError?.('Could not copy the room code.') }
 }
 return <div ref={rootRef} className="gamePage phoneGame" style={{ '--me': color, '--player-color': color,
  '--cs': `${metrics.cell}px`, '--row': `${5 * metrics.tray + 12}px`, '--col': `${5 * metrics.tray + 24}px` }}>
  <header className="top">
   <div className="topRow">
    <button className="more" aria-label="Tipto menu" aria-expanded={overlay === 'menu'} onClick={() => setOverlay(overlay === 'menu' ? null : 'menu')}><Logo /><Icon /></button>
    <div className="turn" style={{ '--pc': getPlayerColorHex(current?.color) }}>
     <span className="lbl">{game.currentPlayerId === me.id ? 'Your turn' : `${current?.name || 'Player'}'s turn`}</span>
     {game.turnEndsAt && <PhoneTimer key={game.turnEndsAt} endsAt={game.turnEndsAt} limit={game.settings.moveTimeLimitSeconds} />}
    </div>
    <button className="plBtn" aria-label="Players" aria-expanded={overlay === 'players'} onClick={() => setOverlay(overlay === 'players' ? null : 'players')}><Icon kind="people" /><small>#{players.findIndex(p => p.id === me.id) + 1}</small><b>{score(me)}</b><Icon /></button>
   </div>
   <div className="dragHint" aria-hidden="true">
    <span className="dh" data-side="flip"><Icon kind="flip" />Flip</span>
    <span className="dhText">Hold the piece against an edge</span>
    <span className="dh" data-side="rot">Rotate<Icon kind="right" /></span>
   </div>
   {overlay === 'menu' && <section className="menu" aria-label="Game menu">
    <div className="brand"><Logo />Tipto</div><h5>Room</h5>
    <div className="code"><span>Code</span><b>{roomCode}</b><button aria-label={copied ? 'Room code copied' : 'Copy room code'} onClick={copyRoom}>{copied ? '\u2713' : <Icon kind="copy" />}</button></div>
    <button className="leaveBtn" onClick={onQuit} disabled={isQuitting}>Leave room</button>
   </section>}
   {overlay === 'players' && <section className="plist" aria-label="Players list">{players.map((player, rank) => <Fragment key={player.id}>
    <button className={`prow${player.id === game.currentPlayerId ? ' active' : ''}${expanded === player.id ? ' open' : ''}`} style={{ '--pc': getPlayerColorHex(player.color) }} aria-expanded={player.id !== me.id ? expanded === player.id : undefined} onClick={() => { if (player.id !== me.id) setExpanded(expanded === player.id ? null : player.id) }}>
     <span className="rk">{rank + 1}</span><span className="nm">{player.id === me.id ? 'You' : player.name}</span>
     {player.id === game.currentPlayerId && <span className="tag">Turn</span>}
     <span className="left">{player.pieces.filter(p => !p.placed).length} left</span><span className="pts">{score(player)}</span>{player.id !== me.id ? <Icon /> : <span className="cvSpace" />}
    </button>
    {expanded === player.id && <div className="pieces">{player.pieces.filter(p => !p.placed).map(piece => <div key={piece.name} title={piece.name}><PhonePieceShape piece={piece} cellSize={6} color={getPlayerColorHex(player.color)} /></div>)}</div>}
   </Fragment>)}</section>}
  </header>
  <main className="boardZone" aria-label="Game board">
   <div className="phoneBoard" data-game-board style={{ gridTemplateColumns: `repeat(${cols}, var(--cs))`, gridTemplateRows: `repeat(${rows}, var(--cs))` }}>
    {board.slice(row, row + rows).flatMap((line, dr) => line.slice(col, col + cols).map((value, dc) => {
     const key = `${row + dr},${col + dc}`, pending = pendingCells.has(key), start = starts.get(key)
     const occupied = value.occupied || pending
     const tileColor = getPlayerColorHex(pending ? pendingPlacement.color : value.color)
     const ability = pending ? pendingPlacement.ability : abilities.get(value.pieceId)
     const style = occupied ? tileFinish(tileColor, ability, 'tray') : start ? { '--pc': getPlayerColorHex(start.color) } : undefined
     return <div key={key} className={`c${value.playable !== false ? ' on' : ''}${occupied ? ' filled' : start ? ' start' : ''}`} style={style} data-row={row + dr} data-col={col + dc} data-ability={ability || 'normal'} aria-label={start ? `${start.name}'s starting square` : undefined} />
    }))}
    <div className="ghostLayer" hidden />
   </div>
  </main>
  <div className="portal" data-side="flip" /><div className="portal" data-side="rot" />
  <section className="trayZone" aria-label="Your pieces" aria-disabled={!canMove || !!pendingPlacement}>
   <div className="tray" ref={trayRef}>{remaining.map(piece => <button key={piece.name} className="pc" data-piece={piece.name} aria-label={`${piece.name}${piece.ability ? ` - ${piece.ability}` : ''}`} disabled={!canMove || !!pendingPlacement} onContextMenu={e => e.preventDefault()}><PhonePieceShape piece={piece} cellSize={metrics.tray} color={color} /></button>)}</div>
   <ScrollBar targetRef={trayRef} label="Scroll your pieces" count={remaining.length} />
  </section>
  <div className="float" hidden aria-hidden="true" />
  {notice}
 </div>
}
