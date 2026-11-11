import { useEffect, useLayoutEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { displayCells, horizontalFlip, tileFinish } from '../../../game/piecePresentation'
import { phonePose, phoneTarget } from '../../../game/phoneGeometry'

function drawShape(element, piece, size, color) {
 const cells = displayCells(piece.cells, piece.rotation, piece.flipped)
 const shape = document.createElement('span')
 shape.className = 'shape'
 shape.style.width = `${(Math.max(...cells.map(([, c]) => c)) + 1) * size}px`
 shape.style.height = `${(Math.max(...cells.map(([r]) => r)) + 1) * size}px`
 for (const [r, c] of cells) {
  const tile = document.createElement('i')
  tile.className = piece.ability || ''
  Object.assign(tile.style, tileFinish(color, piece.ability, 'tray'), {
   width: `${size}px`, height: `${size}px`, left: `${c * size}px`, top: `${r * size}px`,
  })
  // Float-only seams; special pieces retain their tray finish.
  if (piece.ability !== 'scout') tile.style.boxShadow = `inset 0 0 0 1px color-mix(in srgb, ${color} 45%, #000)${piece.ability === 'connector' ? '' : ', inset 0 3px 0 -1px rgba(255,255,255,.22), inset 0 -3px 0 -1px rgba(0,0,0,.2)'}`
  shape.append(tile)
 }
 element.replaceChildren(shape)
 return shape
}

// Pointer positions and animation state stay outside React. Rectangles are read
// at pickup; the rAF loop only writes transforms and changed ghost targets.
export default function usePhoneDrag(rootRef, config) {
 const latest = useRef(config)
 const cancel = useRef(() => {})
 useLayoutEffect(() => { latest.current = config })
 useEffect(() => {
  const root = rootRef.current, tray = root.querySelector('.tray')
  const float = root.querySelector('.float'), ghost = root.querySelector('.ghostLayer')
  const portals = [...root.querySelectorAll('.portal, .dh')]
  let pending = null, drag = null, frame = 0, backTimer = 0, returning = null
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const vibrate = () => navigator.vibrate?.(12)
  const stopPending = () => {
   if (!pending) return
   clearTimeout(pending.timer)
   pending.el.classList.remove('touch')
   pending = null
  }
  const clearBack = () => {
   clearTimeout(backTimer)
   returning?.classList.remove('lifted', 'home')
   returning = null
   float.classList.remove('back')
   float.hidden = true
  }
  const allowed = () => latest.current.canMove && !latest.current.pendingPlacement
   && (!latest.current.game.turnEndsAt || Date.now() < latest.current.game.turnEndsAt)
  const finish = (place = false, animate = true, commit = true) => {
   stopPending()
   if (!drag) { if (!animate) clearBack(); return }
   const d = drag
   drag = null
   cancelAnimationFrame(frame); frame = 0
   clearTimeout(d.repeat)
   root.classList.remove('dragging')
   ghost.hidden = true
   portals.forEach(el => { el.classList.remove('near', 'pulse'); el.style.setProperty('--prox', 0) })
   d.el.classList.remove('touch', 'home', 'lifted')
   if (d.el.hasPointerCapture(d.id)) d.el.releasePointerCapture(d.id)
   if (commit) {
    flushSync(() => latest.current.onStage(d.piece.name))
    for (const action of d.turns) flushSync(() => action === 'rot' ? latest.current.onRotate(270) : latest.current.onFlip())
   }
   if (place && allowed() && d.moved && d.target) {
    float.hidden = true
    latest.current.onPlace(d.target.cells, d.piece)
   } else if (animate && !reduced()) {
    returning = d.el
    d.el.classList.add('lifted')
    float.classList.add('back')
    float.style.transform = `translate3d(${d.home.left}px, ${d.home.top}px, 0) scale(${d.traySize / d.stride})`
    backTimer = setTimeout(clearBack, 190)
   } else float.hidden = true
  }
  cancel.current = () => finish(false, false, false)
  const schedule = () => { if (!frame) frame = requestAnimationFrame(tick) }
  const turn = side => {
   if (!drag) return
   drag.piece = side === 'rot' ? { ...drag.piece, rotation: ((drag.piece.rotation || 0) + 270) % 360 }
    : { ...drag.piece, ...horizontalFlip(drag.piece.rotation || 0, drag.piece.flipped) }
   drag.turns.push(side)
   const shape = drawShape(float, drag.piece, drag.stride, latest.current.color)
   shape.classList.add(side === 'rot' ? 'anim-rot' : 'anim-flip')
   drag.target = null
   drag.targetKey = undefined
   vibrate()
   schedule()
  }
  const repeat = side => {
   if (!drag || drag.side !== side || !allowed()) return
   turn(side)
   drag.repeat = setTimeout(() => repeat(side), 400)
  }
  function tick() {
   frame = 0
   if (!drag) return
   if (!allowed()) { finish(false, false, false); return }
   const d = drag, cfg = latest.current
   const pose = phonePose(d, d.stride)
   float.style.transform = `translate3d(${pose.left}px, ${pose.top}px, 0)`
   const beside = pose.cy <= d.rect.bottom
   const push = beside ? pose.push : 0
   const side = d.moved && Math.abs(push) >= 12 ? (push < 0 ? 'flip' : 'rot') : null
   const proximity = { flip: beside ? Math.max(0, 1 - (pose.left - d.rect.left) / 90) : 0,
    rot: beside ? Math.max(0, 1 - (d.rect.right - pose.left - pose.width) / 90) : 0 }
   portals.forEach(el => {
    const edge = el.dataset.side
    el.style.setProperty('--prox', proximity[edge].toFixed(2))
    el.classList.toggle('near', side === edge)
   })
   if (side !== d.side) { clearTimeout(d.repeat); d.repeat = null; d.side = side }
   if (Math.abs(push) < 3.6) d.armed = true
   if (side) {
    if (d.targetKey !== 'turning') { ghost.hidden = true; d.el.classList.remove('home'); d.target = null; d.targetKey = 'turning' }
    if (d.armed) {
     d.armed = false
     turn(side)
     d.repeat = setTimeout(() => repeat(side), 600)
    }
    return
   }
   const target = d.moved ? phoneTarget({ board: cfg.board, me: cfg.me, players: cfg.game.players,
    piece: d.piece, bounds: cfg.bounds, rect: d.rect, pose, stride: d.stride }) : null
   const key = target?.key || null
   if (key === d.targetKey) return
   d.target = target; d.targetKey = key
   d.el.classList.toggle('home', !target)
   ghost.hidden = !target
   if (target) target.cells.forEach(({ row, col }, i) => {
    ghost.children[i].style.transform = `translate(${(col - cfg.bounds.col) * d.stride}px, ${(row - cfg.bounds.row) * d.stride}px)`
   })
  }
  const promote = () => {
   if (!pending || !allowed()) { stopPending(); return }
   const p = pending, cfg = latest.current
   stopPending(); clearBack()
   cfg.closeOverlays()
   drag = { ...p, piece: { ...p.piece }, turns: [], rect: root.querySelector('.phoneBoard').getBoundingClientRect(),
    home: p.el.querySelector('.shape').getBoundingClientRect(), stride: cfg.metrics.cell + 2,
    traySize: cfg.metrics.tray, moved: p.x !== p.sx || p.y !== p.sy, armed: true, targetKey: undefined }
   p.el.setPointerCapture(p.id)
   p.el.classList.add('lifted')
   root.classList.add('dragging')
   const hint = root.querySelector('.dhText')
   hint.textContent = p.piece.ability === 'scout' ? 'Scout: no corner needed; no own edges.'
    : p.piece.ability === 'connector' ? 'Connector: touch your edge or corner.' : 'Hold the piece against an edge'
   hint.classList.toggle('rule', !!p.piece.ability)
   const top = root.querySelector('.dh').getBoundingClientRect().bottom
   portals.forEach(el => {
    if (el.classList.contains('portal')) { el.style.top = `${top}px`; el.style.height = `${Math.max(0, drag.rect.bottom - top)}px` }
    el.classList.add('pulse')
   })
   ghost.replaceChildren(...p.piece.cells.map(() => {
    const el = document.createElement('span'); el.className = 'ghost'
    el.style.width = el.style.height = `${cfg.metrics.cell}px`
    return el
   }))
   ghost.hidden = true
   drawShape(float, drag.piece, drag.stride, cfg.color)
   float.hidden = false
   vibrate(); schedule()
  }
  const down = e => {
   const el = e.target.closest('.pc')
   if (!el || !allowed() || pending || drag || e.button !== 0) return
   const piece = latest.current.pieces.find(p => p.name === el.dataset.piece)
   if (!piece || piece.placed) return
   el.classList.add('touch')
   pending = { el, piece, id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, timer: setTimeout(promote, 120) }
  }
  const move = e => {
   if (pending?.id === e.pointerId) {
    pending.x = e.clientX; pending.y = e.clientY
    const dx = pending.x - pending.sx, dy = pending.y - pending.sy
    if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) { stopPending(); return }
    if (dy < -6) promote()
    else if (Math.hypot(dx, dy) > 6) stopPending()
    return
   }
   if (drag?.id !== e.pointerId) return
   drag.x = e.clientX; drag.y = e.clientY
   if (Math.hypot(drag.x - drag.sx, drag.y - drag.sy) > 8) drag.moved = true
   schedule()
  }
  const up = e => {
   if (pending?.id === e.pointerId) stopPending()
   if (drag?.id !== e.pointerId) return
   // Flush the last queued pointer position so the released spot is the shown spot.
   cancelAnimationFrame(frame); frame = 0; tick()
   finish(true)
  }
  const cancelled = e => {
   // Touch begins with implicit capture on the tile. Moving capture to its tray
   // button emits lostpointercapture on that tile; that is not a cancelled drag.
   if (e.type === 'lostpointercapture' && e.target !== drag?.el) return
   if (pending?.id === e.pointerId) stopPending()
   if (drag?.id === e.pointerId) finish()
  }
  const touchMove = e => { if (drag && e.cancelable) e.preventDefault() }
  const abort = () => finish(false, false, false)
  const escape = e => { if (e.key === 'Escape') finish() }
  tray.addEventListener('pointerdown', down)
  tray.addEventListener('scroll', stopPending)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancelled)
  tray.addEventListener('lostpointercapture', cancelled)
  window.addEventListener('resize', abort)
  window.addEventListener('blur', abort)
  document.addEventListener('keydown', escape)
  document.addEventListener('touchmove', touchMove, { passive: false })
  return () => {
   abort(); clearBack()
   tray.removeEventListener('pointerdown', down); tray.removeEventListener('scroll', stopPending)
   window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
   window.removeEventListener('pointercancel', cancelled); window.removeEventListener('resize', abort)
   tray.removeEventListener('lostpointercapture', cancelled)
   window.removeEventListener('blur', abort); document.removeEventListener('keydown', escape)
   document.removeEventListener('touchmove', touchMove)
  }
 }, [rootRef])
 const { canMove, pendingPlacement, board, game: { turnEndsAt, turnNumber, currentPlayerId } } = config
 useEffect(() => {
  cancel.current()
  const timeout = turnEndsAt ? setTimeout(() => cancel.current(), Math.max(0, turnEndsAt - Date.now())) : null
  return () => clearTimeout(timeout)
 }, [canMove, pendingPlacement, board, turnEndsAt, turnNumber, currentPlayerId])
}
