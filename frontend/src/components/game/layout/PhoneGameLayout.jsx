import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Board from '../board/Board'
import { displayCells, tileFinish } from '../../../game/piecePresentation'
import { isValidPlacement } from '../../../game/placementRules'
import { getPlayerColorHex } from '../../../game/playerColors'

const NOOP = () => {}
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
 return <svg viewBox="0 0 24 24" aria-hidden="true">{kind === 'menu' ? <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></> : kind === 'left' ? <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" /> : kind === 'right' ? <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /> : kind === 'flip' ? <path d="M12 3v18M8 7 3 12l5 5V7zM16 7l5 5-5 5V7z" /> : kind === 'copy' ? <><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M16 8V4H4v12h4" /></> : <path d="m6 9 6 6 6-6" />}</svg>
}

// All phone piece previews use the same finish, integer tile sizes and spacing.
function PhonePieceShape({ piece, cellSize, color, gap = 1 }) {
 if (!piece) return null
 const cells = displayCells(piece.cells, piece.rotation, piece.flipped)
 const columns = Math.max(...cells.map(([, col]) => col)) + 1
 const rows = Math.max(...cells.map(([row]) => row)) + 1
 const size = Math.round(cellSize)
 const spacing = Math.round(gap)
 return <span className="phonePieceShape" aria-hidden="true" style={{ width: columns * size + (columns - 1) * spacing, height: rows * size + (rows - 1) * spacing }}>
  {cells.map(([row, col], index) => <i key={index} style={{ width: size, height: size, top: row * (size + spacing), left: col * (size + spacing), borderRadius: Math.max(1, Math.round(size * 0.11)), ...tileFinish(color, piece.ability, 'tray') }} />)}
 </span>
}

function placementReason(board, cells, player, isFirstMove, players, ability) {
	const height = board.length
	const width = board[0]?.length || 0
	if (!cells.length || cells.some(cell => cell.row < 0 || cell.row >= height || cell.col < 0 || cell.col >= width)) return 'Keep the whole piece on the board'
	if (cells.some(cell => board[cell.row][cell.col].playable === false)) return 'That square is not playable'
	if (cells.some(cell => board[cell.row][cell.col].occupied)) return 'Pieces cannot overlap'
	const reserved = new Set(players.filter(other => other.id !== player.id && other.startPosition && !other.pieces.some(piece => piece.placed)).map(other => `${other.startPosition.row},${other.startPosition.col}`))
	if (cells.some(cell => reserved.has(`${cell.row},${cell.col}`))) return 'That starting square is reserved'
	if (isFirstMove) return 'Your first piece must cover your starting square'
	let edge = false
	let corner = false
	for (const cell of cells) {
		edge ||= [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => board[cell.row + dr]?.[cell.col + dc]?.player === player.id)
		corner ||= [[-1, -1], [-1, 1], [1, -1], [1, 1]].some(([dr, dc]) => board[cell.row + dr]?.[cell.col + dc]?.player === player.id)
	}
	if (edge && ability !== 'connector') return 'Your pieces can only touch at the corners'
	if (ability === 'connector' && !edge && !corner) return 'Connector must touch along an edge or corner'
	if (ability !== 'scout' && ability !== 'connector' && !corner) return 'Your piece must touch one of your corners'
	return 'That piece cannot be placed there'
}

export default function PhoneGameLayout({
 game, me, board, canMove, pieces, selectedPiece, selectedPieceName, pendingPlacement,
 onStage, onRotate, onFlip, onPlace, onQuit, lastMove, notice,
}) {
 const boardZoneRef = useRef(null)
 const stripRef = useRef(null)
 const pointerRef = useRef(null)
 const [drag, setDrag] = useState(null)
 const [overlay, setOverlay] = useState(null)
 const [expanded, setExpanded] = useState(null)
 const [copied, setCopied] = useState(false)
 const [metrics, setMetrics] = useState({ cell: 10, gap: 1, pad: 5 })
 const current = game.players.find(player => player.id === game.currentPlayerId)
 const ownColor = getPlayerColorHex(me?.color)
 const isFirstMove = !me?.pieces.some(piece => piece.placed)
 const boardRows = board.length
 const boardColumns = board[0]?.length || 1
 const turnOrder = Object.keys(game.settings.players || {}).map(key => game.players.find(player => player.settingsPlayerKey === key)).filter(Boolean)
 const players = [...turnOrder, ...game.players.filter(player => !turnOrder.includes(player))].sort((a, b) => score(b) - score(a))
 const activeDrag = canMove && !pendingPlacement && drag?.piece === selectedPiece ? drag : null

 useLayoutEffect(() => {
  const zone = boardZoneRef.current
  const fit = () => {
   const width = zone.clientWidth - 8
   const height = zone.clientHeight - 16
   const rows = boardRows
   const cols = boardColumns
   let cell = Math.max(1, Math.floor(Math.min(width / cols, height / rows)))
   const sizes = size => ({ cell: size, gap: Math.max(1, Math.round(size * 0.075)), pad: Math.round(size * 0.5) })
   while (cell > 1) {
    const { gap, pad } = sizes(cell)
    if (cols * cell + (cols - 1) * gap + 2 * pad + 2 <= width && rows * cell + (rows - 1) * gap + 2 * pad + 2 <= height) break
    cell--
   }
   const next = sizes(cell)
   setMetrics(old => old.cell === next.cell && old.gap === next.gap && old.pad === next.pad ? old : next)
  }
  fit()
  const observer = new ResizeObserver(fit)
  observer.observe(zone)
  return () => observer.disconnect()
 }, [boardRows, boardColumns])

 useEffect(() => {
  stripRef.current?.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' })
 }, [game.currentPlayerId, game.players])

 useEffect(() => {
  if (!overlay) return undefined
  const close = event => { if (event.key === 'Escape') { setOverlay(null); setExpanded(null) } }
  document.addEventListener('keydown', close)
  return () => document.removeEventListener('keydown', close)
 }, [overlay])

 const locateDrag = (clientX, clientY) => {
  const element = boardZoneRef.current?.querySelector('[data-game-board]')
  if (!element || !selectedPiece) return null
  const rect = element.getBoundingClientRect()
  const { cell, gap, pad } = metrics
  const stride = cell + gap
  const oriented = displayCells(selectedPiece.cells, selectedPiece.rotation, selectedPiece.flipped)
  const rows = Math.max(...oriented.map(([row]) => row)) + 1
  const cols = Math.max(...oriented.map(([, col]) => col)) + 1
  const left = clientX - (cols * cell + (cols - 1) * gap) / 2
  const top = clientY - (rows + 2) * stride
  const overBoard = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  if (!overBoard) return { piece: selectedPiece, left, top, cells: [], overBoard: false }
  const fc = (clientX - rect.left - pad - cols * stride / 2) / stride
  const fr = (clientY - rect.top - pad - (rows + 2) * stride) / stride
  let best = null
  let distance = Infinity
  for (let row = Math.floor(fr) - 6; row <= Math.ceil(fr) + 6; row++) {
   for (let col = Math.floor(fc) - 6; col <= Math.ceil(fc) + 6; col++) {
    const d = (row - fr) ** 2 + (col - fc) ** 2
    if (d >= distance) continue
    const cells = oriented.map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
    if (!isValidPlacement(board, cells, me, isFirstMove, game.players, selectedPiece.ability)) continue
    distance = d
    best = { cells, hoverLeft: rect.left + pad + col * stride, hoverTop: rect.top + pad + row * stride }
   }
  }
  const raw = oriented.map(([row, col]) => ({ row: Math.round(fr) + row, col: Math.round(fc) + col }))
  return { piece: selectedPiece, left, top, overBoard, cells: [], ...best, reason: best ? '' : placementReason(board, raw, me, isFirstMove, game.players, selectedPiece.ability) }
 }
 const handlePointerDown = event => {
  if (!selectedPiece || !canMove || pendingPlacement || pointerRef.current || (event.button !== 0 && event.pointerType === 'mouse')) return
  event.preventDefault()
  event.currentTarget.setPointerCapture(event.pointerId)
  pointerRef.current = { id: event.pointerId, piece: selectedPiece }
  setDrag(locateDrag(event.clientX, event.clientY))
 }
 const handlePointerMove = event => {
  if (pointerRef.current?.id !== event.pointerId) return
  if (!canMove || pointerRef.current.piece !== selectedPiece || pendingPlacement) { pointerRef.current = null; setDrag(null); return }
  setDrag(locateDrag(event.clientX, event.clientY))
 }
 const endDrag = event => {
  if (pointerRef.current?.id !== event.pointerId) return
  const dropped = event.type === 'pointerup' && canMove && !pendingPlacement && pointerRef.current.piece === selectedPiece ? locateDrag(event.clientX, event.clientY) : null
  pointerRef.current = null
  setDrag(null)
  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  if (dropped?.cells.length) onPlace(dropped.cells, selectedPiece)
 }
 const closeOverlays = () => { setOverlay(null); setExpanded(null) }
 const openStandings = () => { setOverlay('standings'); setExpanded(null) }
 const roomCode = game.inviteCode || game.gameId
 const copyRoom = async () => {
  try { await navigator.clipboard.writeText(roomCode); setCopied(true) } catch { setCopied(false) }
 }
 let status = 'Choose a piece, then drag it onto the board'
 if (!canMove) status = `Waiting for ${current?.name || 'Player'}...`
 else if (activeDrag?.overBoard && !activeDrag.cells.length) status = activeDrag.reason
 else if (isFirstMove) status = <><i className="phoneStartIcon" />First move: cover your starting square</>
 else if (selectedPiece?.ability === 'scout') status = <span><b>Scout</b>: no corner needed; no shared edges</span>
 else if (selectedPiece?.ability === 'connector') status = <span><b>Connector</b>: can touch your pieces along an edge</span>
 else if (selectedPiece) status = 'Drag the piece onto the board'

 return <div className="gamePage phoneGame" style={{ '--player-color': ownColor }}>
  <div className="gameCity" aria-hidden="true" /><div className="gameCityFade" aria-hidden="true" />
  <header className="phoneGameHeader">
   <h1><span className="phoneGameLogoMark" aria-hidden="true"><i /><i /><i /></span>Tipto</h1>
   <div className="phoneTurnPill" style={{ '--turn-color': getPlayerColorHex(current?.color) }}>
    <strong>{canMove ? 'Your turn' : `${current?.name || 'Player'}'s turn`}</strong>
    {game.turnEndsAt ? <PhoneTimer key={`${game.turnNumber}-${game.turnEndsAt}`} endsAt={game.turnEndsAt} limit={game.settings.moveTimeLimitSeconds} /> : <span className="phoneTime">No limit</span>}
   </div>
   <button type="button" className="phoneMenuButton" aria-label="Menu" aria-expanded={overlay === 'menu'} aria-controls="phone-menu" onClick={() => { setOverlay(overlay === 'menu' ? null : 'menu'); setExpanded(null) }}><Icon kind="menu" /></button>
  </header>
  <div className="phonePlayersBar">
   <div className="phonePlayerChips" ref={stripRef}>{players.map(player => <button type="button" key={player.id} className={`phonePlayerChip${player.id === game.currentPlayerId ? ' active' : ''}`} style={{ '--pc': getPlayerColorHex(player.color) }} onClick={openStandings}><i /><span>{player.id === me.id ? 'You' : player.name}</span><b>{score(player)}</b></button>)}</div>
   <button type="button" className="phoneAllPlayers" aria-label="Standings" aria-expanded={overlay === 'standings'} onClick={openStandings}><Icon /></button>
  </div>
  <main className="phoneBoardZone" ref={boardZoneRef} style={{ '--phone-cell': `${metrics.cell}px`, '--phone-gap': `${metrics.gap}px`, '--phone-pad': `${metrics.pad}px` }}>
   <Board board={board} onTileClick={NOOP} onBoardPointerMove={NOOP} onBoardLeave={NOOP} hoverCells={[]} pendingPlacement={pendingPlacement} players={game.players} currentPlayerId={me.id} preview={{ color: me.color, ability: selectedPiece?.ability }} lastMove={lastMove} trayPresentation trayMetrics={metrics} lastMoveWidth={1} />
  </main>
  <section className="phoneDock" aria-label="Your pieces">
   <div className={`phoneStatus${canMove && isFirstMove ? ' first' : ''}`} role="status" title={typeof status === 'string' ? status : undefined}>{status}</div>
   <div className="phonePickRow">
    <div className={`phoneStageSlot${canMove ? '' : ' waiting'}`} aria-label="Drag selected piece" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
     {selectedPiece ? <PhonePieceShape piece={selectedPiece} cellSize={selectedPiece.cells.length <= 2 ? 22 : 16} color={ownColor} /> : <span>{pieces.every(piece => piece.placed) ? 'All pieces placed' : 'Choose a piece'}</span>}
    </div>
    <button type="button" onClick={() => onRotate(90)} disabled={!selectedPiece} aria-label="Rotate left"><Icon kind="left" /><span>Left</span></button>
    <button type="button" onClick={() => onRotate(270)} disabled={!selectedPiece} aria-label="Rotate right"><Icon kind="right" /><span>Right</span></button>
    <button type="button" onClick={onFlip} disabled={!selectedPiece} aria-label="Flip"><Icon kind="flip" /><span>Flip</span></button>
   </div>
   <div className="phonePieceGrid">{pieces.map(piece => <button type="button" key={piece.name} className={`phonePieceCard${selectedPieceName === piece.name && !piece.placed ? ' selected' : ''}${piece.placed ? ' placed' : ''}`} disabled={piece.placed} aria-label={`${piece.name}${piece.ability ? ` - ${piece.ability}` : ''}${piece.placed ? ' - used' : ''}`} aria-pressed={selectedPieceName === piece.name && !piece.placed} onClick={() => onStage(piece.name)}><PhonePieceShape piece={piece} cellSize={6} color={ownColor} /></button>)}</div>
  </section>
  {activeDrag && selectedPiece && <>
   <div className="phoneDragFollower" style={{ left: activeDrag.left, top: activeDrag.top }}><PhonePieceShape piece={selectedPiece} cellSize={metrics.cell} gap={metrics.gap} color={ownColor} /></div>
   {!!activeDrag.cells.length && <div className="phoneHoverPlacement" style={{ left: activeDrag.hoverLeft, top: activeDrag.hoverTop }}><PhonePieceShape piece={selectedPiece} cellSize={metrics.cell} gap={metrics.gap} color={ownColor} /></div>}
  </>}
  {notice}
  {overlay && <div className="phoneOutsideCatch" onClick={closeOverlays} />}
  {overlay === 'menu' && <section className="phoneMenu" id="phone-menu" aria-label="Game menu">
   <h3>Room</h3><div className="phoneRoomRow"><span>Code <strong>{roomCode}</strong></span><button type="button" aria-label={copied ? 'Room code copied' : 'Copy room code'} onClick={copyRoom}>{copied ? '\u2713' : <Icon kind="copy" />}</button></div>
   <h3>Tile guide</h3><div className="phoneTileGuide"><span><i className="phoneStartIcon" />Starting squares</span><span><i className="phoneLastIcon" />Last move</span><span><i style={tileFinish(ownColor, 'scout', 'tray')} />Scout</span><span><i style={tileFinish(ownColor, 'connector', 'tray')} />Connector</span></div>
   <button type="button" className="phoneHeaderLeave" onClick={onQuit}>Leave game</button>
  </section>}
  {overlay === 'standings' && <section className="phoneStandings" role="dialog" aria-label="Standings"><div className="phoneGrab" /><h2>Standings</h2><div className="phoneStandingsList">{players.map(player => {
   const remaining = player.pieces.filter(piece => !piece.placed)
   const open = expanded === player.id && player.id !== me.id
   const color = getPlayerColorHex(player.color)
   return <Fragment key={player.id}><button type="button" className={`phoneStandingRow${player.id === game.currentPlayerId ? ' active' : ''}${open ? ' open' : ''}`} style={{ '--pc': color }} aria-expanded={player.id === me.id ? undefined : open} onClick={() => { if (player.id !== me.id) setExpanded(open ? null : player.id) }}><i /><span className="phoneStandingName">{player.id === me.id ? 'You' : player.name}</span><span className="phonePips" aria-label={`${player.pieces.length - remaining.length} pieces placed`}>{Array.from({ length: 16 }, (_, index) => <i key={index} className={index < player.pieces.length - remaining.length ? 'filled' : ''} />)}</span><b>{score(player)}<small>pts</small></b>{player.id !== me.id ? <Icon /> : <span />}</button>{open && <div className="phoneRemaining" style={{ '--pc': color }}><h4><b>{player.name}</b> has {remaining.length} pieces left</h4><div>{remaining.map(piece => <span className="phoneRemainingCard" key={piece.name} title={piece.name}><PhonePieceShape piece={piece} cellSize={7} color={color} /></span>)}</div></div>}</Fragment>
  })}</div></section>}
 </div>
}
