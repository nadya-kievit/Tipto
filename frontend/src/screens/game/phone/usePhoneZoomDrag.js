import { useEffect, useLayoutEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { displayCells, horizontalFlip } from '../piece/piecePresentation'
import { isValidPlacement } from '../board/placementRules'
import { PHONE_ZOOM as Z, initZoom, blendView, advanceZoom, piecePose, isOverBoard, cameraFollow, nearestVisiblePlacement } from './phoneZoom'

// Same .shape / .pieceFinish presentation as PhonePieceShape. Only this
// outer float is scaled; page-colour bridges cover adjacent seams, never holes.
function drawFloat(element, piece, size, color, animation) {
 const cells = displayCells(piece.cells, piece.rotation, piece.flipped)
 const occupied = new Set(cells.map(([r, c]) => `${r},${c}`))
 const rows = Math.max(...cells.map(([r]) => r)) + 1,
  cols = Math.max(...cells.map(([, c]) => c)) + 1
 const shape = document.createElement('span')
 shape.className = `shape pieceFinish ${animation || ''}`
 shape.dataset.ability = piece.ability || 'normal'
 shape.style.setProperty('--piece-color', color)
 shape.style.width = `${cols * size + cols - 1}px`
 shape.style.height = `${rows * size + rows - 1}px`
 const bridge = (left, top, width, height) => {
  const el = document.createElement('b')
  Object.assign(el.style, {
   position: 'absolute',
   background: 'var(--page)',
   left: `${left}px`,
   top: `${top}px`,
   width: `${width}px`,
   height: `${height}px`
  })
  shape.append(el)
 }
 for (const [r, c] of cells) {
  const x = c * (size + 1),
   y = r * (size + 1)
  const right = occupied.has(`${r},${c + 1}`),
   down = occupied.has(`${r + 1},${c}`)
  if (right) bridge(x + size, y, 1, size)
  if (down) bridge(x, y + size, size, 1)
  if (right && down && occupied.has(`${r + 1},${c + 1}`)) bridge(x + size, y + size, 1, 1)
  const tile = document.createElement('i')
  tile.className = 'pieceFinishTile'
  Object.assign(tile.style, {
   left: `${x}px`,
   top: `${y}px`,
   width: `${size}px`,
   height: `${size}px`
  })
  shape.append(tile)
 }
 element.replaceChildren(shape)
 return {
  rows,
  cols
 }
}
export default function usePhoneZoomDrag(rootRef, cameraRef, config, enabled) {
 const latest = useRef(config),
  cancel = useRef(() => {})
 useLayoutEffect(() => {
  latest.current = config
 })
 useEffect(() => {
  if (!enabled) return
  const root = rootRef.current,
   tray = root.querySelector('.tray')
  const float = root.querySelector('.float'),
   ghost = root.querySelector('.ghostLayer')
  const tabs = [...root.querySelectorAll('.dh')],
   camera = cameraRef.current
  let drag = null,
   pending = null,
   frame = 0,
   backTimer = 0,
   returning = null
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const allowed = () => latest.current.canMove && (!latest.current.game.turnEndsAt || Date.now() < latest.current.game.turnEndsAt)
  const stopPending = () => {
   if (!pending) return
   clearTimeout(pending.timer)
   pending.el.classList.remove('touch')
   pending = null
   if (!drag) camera.setBusy(false)
  }
  const clearBack = () => {
   clearTimeout(backTimer)
   returning?.classList.remove('lifted', 'home')
   returning = null
   float.classList.remove('back')
   float.hidden = true
  }
  const sync = () => {
   const rect = camera.windowRect(),
    rects = camera.rects()
   const step = Z.step * camera.view.s
   const pose = piecePose(drag, rects.br, drag.cols * step, drag.rows * step)
   return {
    rect,
    ...rects,
    pose
   }
  }
  const paint = () => {
   if (!drag) return
   const {
    pose,
    br
   } = sync()
   float.style.transform = `translate3d(${pose.left}px, ${pose.top}px, 0) scale(${Z.step * camera.view.s / (drag.traySize + 1)})`
   for (const tab of tabs) tab.style.setProperty('--lh', `${Math.max(0, br.bottom - tab.getBoundingClientRect().bottom)}px`)
  }
  const completeView = (d, valid, animate) => {
   const returnOver = () => {
    if (!valid) camera.showOverview(animate)
   }
   if (d.z && d.zp > 0 && d.zp < 1) {
    if (d.zdir === 1) camera.goView({
     ...d.z.end,
     mode: 'zoom'
    }, d.z.focus, animate, returnOver)
    else camera.showOverview(animate)
   } else returnOver()
  }
  const finish = (place = false, animate = true, commit = true) => {
   stopPending()
   if (!drag) {
    if (!animate) clearBack()
    return
   }
   const d = drag,
    cfg = latest.current
   const valid = place && allowed() && d.moved && d.target && isValidPlacement(cfg.board, d.target.cells, cfg.me, !cfg.me.pieces.some(p => p.placed), cfg.game.players, d.piece.ability)
   drag = null
   cancelAnimationFrame(frame)
   frame = 0
   camera.setDragPainter(null)
   camera.setBusy(false)
   root.classList.remove('dragging')
   ghost.hidden = true
   tabs.forEach(el => {
    el.classList.remove('near', 'pulse', 'fire', 'fireSoft')
    el.style.setProperty('--prox', 0)
    el.style.setProperty('--amt', 0)
   })
   d.el.classList.remove('touch', 'lifted', 'home')
   if (d.el.hasPointerCapture(d.id)) d.el.releasePointerCapture(d.id)
   if (commit) {
    flushSync(() => cfg.onStage(d.piece.name))
    for (const action of d.turns) flushSync(() => action === 'rot' ? latest.current.onRotate(270) : latest.current.onFlip())
   }
   completeView(d, valid, animate)
   if (valid) {
    float.hidden = true
    latest.current.onPlace(d.target.cells, d.piece)
   } else if (animate && !reduced() && d.el.isConnected) {
    // Read the new tray orientation after committing turns. Return at tray size.
    const home = d.el.querySelector('.shape').getBoundingClientRect()
    returning = d.el
    d.el.classList.add('lifted')
    float.classList.add('back')
    float.style.transform = `translate3d(${home.left}px, ${home.top}px, 0) scale(1)`
    backTimer = setTimeout(clearBack, 190)
   } else float.hidden = true
  }
  const abort = () => finish(false, false, false)
  cancel.current = abort
  const draw = animation => {
   const dimensions = drawFloat(float, drag.piece, drag.traySize, latest.current.color, animation)
   Object.assign(drag, dimensions)
  }
  const turn = (side, soft, now) => {
   drag.lastTurn = now
   drag.piece = side === 'rot' ? {
    ...drag.piece,
    rotation: ((drag.piece.rotation || 0) + 270) % 360
   } : {
    ...drag.piece,
    ...horizontalFlip(drag.piece.rotation || 0, drag.piece.flipped)
   }
   drag.turns.push(side)
   draw(side === 'rot' ? 'anim-rot' : 'anim-flip')
   const tab = tabs.find(el => el.dataset.side === side)
   tab.classList.remove('pulse', 'fire', 'fireSoft')
   void tab.offsetWidth
   tab.classList.add(soft ? 'fireSoft' : 'fire')
   navigator.vibrate?.(12)
  }
  const updateTarget = ({
   pose,
   gr,
   br,
   rect
  }) => {
   const cfg = latest.current,
    d = drag
   const target = d.moved && isOverBoard(pose, br) ? nearestVisiblePlacement({
    board: cfg.board,
    me: cfg.me,
    players: cfg.game.players,
    piece: d.piece,
    bounds: cfg.bounds,
    gr,
    rect,
    pose,
    scale: camera.view.s,
    cache: d.cache
   }) : null
   d.target = target
   d.el.classList.toggle('home', !target)
   ghost.hidden = !target
   if (target) target.cells.forEach(({
    row,
    col
   }, i) => {
    ghost.children[i].style.transform = `translate(${(col - cfg.bounds.col) * Z.step}px, ${(row - cfg.bounds.row) * Z.step}px)`
   })
  }
  function tick(now = performance.now()) {
   frame = 0
   if (!drag) return
   if (!allowed()) {
    abort()
    return
   }
   frame = requestAnimationFrame(tick)
   const d = drag,
    dt = Math.min(0.05, Math.max(0.001, (now - (d.previousTime ?? now - 16)) / 1000))
   d.previousTime = now
   let geometry = sync()
   let {
    pose,
    br
   } = geometry
   const {
    gr
   } = geometry
   const instant = d.lastCentre ? Math.hypot(pose.cx - d.lastCentre[0], pose.cy - d.lastCentre[1]) / dt : 0
   d.lastCentre = [pose.cx, pose.cy]
   d.sp = d.sp * 0.7 + instant * 0.3
   const turning = pose.cy <= br.bottom && Math.abs(pose.push) >= Z.push * 0.5 || now - d.lastTurn < Z.turnQuietMs
   const previous = d.zp
   const state = advanceZoom(d, {
    over: d.moved && isOverBoard(pose, br),
    moved: d.moved,
    speed: d.sp,
    centre: [pose.cx, pose.cy],
    turning,
    dt,
    reduced: reduced()
   })
   Object.assign(d, state)
   if (previous === 0 && d.zp > 0) {
    const cells = d.target?.cells,
     bounds = latest.current.bounds
    const focus = cells ? [cells.reduce((a, c) => a + (c.col - bounds.col) * Z.step + Z.cell / 2, 0) / cells.length, cells.reduce((a, c) => a + (c.row - bounds.row) * Z.step + Z.cell / 2, 0) / cells.length] : [(pose.cx - gr.left) / camera.view.s, (pose.cy - gr.top) / camera.view.s]
    d.z = initZoom(camera.size, camera.board, focus)
   }
   if (previous !== d.zp && d.z) {
    Object.assign(camera.view, blendView(d.z, d.zp), {
     mode: d.zp >= 1 ? 'zoom' : 'over'
    })
    camera.apply()
    if (d.zp === 0) d.z = null
    geometry = sync()
    pose = geometry.pose
    br = geometry.br
   }
   if (d.zp === 1) {
    const cameraStep = cameraFollow(d.edges, {
     pose,
     rect: geometry.rect,
     view: camera.view,
     size: camera.size,
     board: camera.board,
     dt,
     active: d.moved && !turning
    })
    d.edges = cameraStep.edges
    if (cameraStep.dx || cameraStep.dy) {
     camera.view.tx += cameraStep.dx
     camera.view.ty += cameraStep.dy
     camera.clampView()
     camera.apply()
     geometry = sync()
     pose = geometry.pose
     br = geometry.br
    }
    if (d.z) {
     d.z.end = {
      ...camera.view
     }
     d.z.focus = [(camera.size.width / 2 - camera.view.tx) / camera.view.s, (camera.size.height / 2 - camera.view.ty) / camera.view.s]
    }
   }
   const push = pose.cy <= br.bottom ? pose.push : 0
   const side = push < 0 ? 'flip' : push > 0 ? 'rot' : null
   const amount = Math.min(1, Math.abs(push) / Z.push)
   for (const tab of tabs) {
    const mine = tab.dataset.side === side
    const distance = tab.dataset.side === 'flip' ? pose.left - br.left : br.right - pose.left - pose.width
    const proximity = pose.cy <= br.bottom ? 0.5 * Math.max(0, 1 - distance / 60) + 0.5 * (mine ? amount : 0) : 0
    tab.style.setProperty('--prox', proximity.toFixed(2))
    tab.style.setProperty('--amt', mine ? amount.toFixed(2) : 0)
    tab.classList.toggle('near', mine && amount >= 1)
   }
   if (Math.abs(push) < Z.push * 0.5) d.armed = true
   const full = d.moved && amount >= 1
   if (!full || side !== d.portalSide) d.nextTurn = 0
   if (full && d.armed) {
    d.armed = false
    turn(side, false, now)
    d.nextTurn = now + Z.repeatDelayMs
   } else if (full && d.nextTurn && now >= d.nextTurn) {
    turn(side, true, now)
    d.nextTurn = now + Z.repeatMs
   }
   d.portalSide = side
   // A turn never hides the drop spot: resolve the new orientation immediately.
   updateTarget(sync())
   paint()
  }
  const promote = () => {
   if (!pending || !allowed()) {
    stopPending()
    return
   }
   const p = pending,
    cfg = latest.current
   stopPending()
   clearBack()
   cfg.closeOverlays()
   camera.stop(true)
   camera.setBusy(true)
   const zp = camera.view.mode === 'zoom' ? 1 : 0
   drag = {
    ...p,
    piece: {
     ...p.piece
    },
    turns: [],
    traySize: cfg.metrics.tray,
    moved: p.x !== p.sx || p.y !== p.sy,
    zp,
    zdir: 0,
    sp: 0,
    offT: 0,
    stillT: 0,
    seenBoard: false,
    armed: false,
    lastTurn: -Infinity,
    edges: {},
    cache: new Map(),
    target: null
   }
   if (zp) drag.z = initZoom(camera.size, camera.board, [(camera.size.width / 2 - camera.view.tx) / camera.view.s, (camera.size.height / 2 - camera.view.ty) / camera.view.s], {
    ...camera.view
   })
   p.el.setPointerCapture(p.id)
   p.el.classList.add('lifted')
   root.classList.add('dragging')
   const hint = root.querySelector('.dhText')
   hint.textContent = p.piece.ability === 'scout' ? 'Scout: no corner needed; no own edges.' : p.piece.ability === 'connector' ? 'Connector: touch your edge or corner.' : 'Hold the piece against an edge'
   hint.classList.toggle('rule', !!p.piece.ability)
   for (const tab of tabs) {
    tab.classList.remove('pulse', 'fire', 'fireSoft')
    void tab.offsetWidth
    tab.classList.add('pulse')
   }
   ghost.replaceChildren(...p.piece.cells.map(() => {
    const el = document.createElement('span')
    el.className = 'ghost'
    el.style.width = el.style.height = `${Z.cell}px`
    el.style.background = `color-mix(in srgb, ${cfg.color} 55%, var(--cell))`
    return el
   }))
   ghost.hidden = true
   draw()
   float.hidden = false
   camera.setDragPainter(paint)
   navigator.vibrate?.(12)
   tick()
  }
  const down = event => {
   const el = event.target.closest('.pc')
   if (!el || !allowed() || pending || drag || event.button !== 0 || event.isPrimary === false) return
   const piece = latest.current.pieces.find(p => p.name === el.dataset.piece)
   if (!piece || piece.placed) return
   el.classList.add('touch')
   camera.setBusy(true)
   pending = {
    el,
    piece,
    id: event.pointerId,
    sx: event.clientX,
    sy: event.clientY,
    x: event.clientX,
    y: event.clientY,
    timer: setTimeout(promote, Z.pickMs)
   }
  }
  const move = event => {
   if (pending?.id === event.pointerId) {
    pending.x = event.clientX
    pending.y = event.clientY
    const dx = pending.x - pending.sx,
     dy = pending.y - pending.sy
    if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) stopPending()
    else if (dy < -6) promote()
    return
   }
   if (drag?.id !== event.pointerId) return
   drag.x = event.clientX
   drag.y = event.clientY
   if (Math.hypot(drag.x - drag.sx, drag.y - drag.sy) > 8) drag.moved = true
  }
  const up = event => {
   if (pending?.id === event.pointerId) stopPending()
   if (drag?.id !== event.pointerId) return
   drag.x = event.clientX
   drag.y = event.clientY
   cancelAnimationFrame(frame)
   tick()
   finish(true)
  }
  const cancelled = event => {
   if (event.type === 'lostpointercapture' && event.target !== drag?.el) return
   if (pending?.id === event.pointerId) stopPending()
   if (drag?.id === event.pointerId) finish()
  }
  const extraTouch = event => {
   if (event.pointerType === 'touch' && !event.isPrimary) finish(false, true, false)
  }
  const escape = event => {
   if (event.key !== 'Escape') return
   if (drag || pending) finish()
   else camera.showOverview()
  }
  const touchMove = event => {
   if (drag && event.cancelable) event.preventDefault()
  }
  tray.addEventListener('pointerdown', down)
  tray.addEventListener('scroll', stopPending)
  tray.addEventListener('lostpointercapture', cancelled)
  window.addEventListener('pointerdown', extraTouch)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancelled)
  window.addEventListener('resize', abort)
  window.addEventListener('blur', abort)
  document.addEventListener('keydown', escape)
  document.addEventListener('touchmove', touchMove, {
   passive: false
  })
  return () => {
   abort()
   clearBack()
   tray.removeEventListener('pointerdown', down)
   tray.removeEventListener('scroll', stopPending)
   tray.removeEventListener('lostpointercapture', cancelled)
   window.removeEventListener('pointerdown', extraTouch)
   window.removeEventListener('pointermove', move)
   window.removeEventListener('pointerup', up)
   window.removeEventListener('pointercancel', cancelled)
   window.removeEventListener('resize', abort)
   window.removeEventListener('blur', abort)
   document.removeEventListener('keydown', escape)
   document.removeEventListener('touchmove', touchMove)
  }
 }, [rootRef, cameraRef, enabled])
 const {
  canMove,
  board,
  metrics: {
   tray
  },
  game: {
   turnEndsAt,
   turnNumber,
   currentPlayerId
  }
 } = config
 useEffect(() => {
  if (!enabled) return
  cancel.current()
  const timeout = turnEndsAt ? setTimeout(() => cancel.current(), Math.max(0, turnEndsAt - Date.now())) : null
  return () => clearTimeout(timeout)
 }, [enabled, canMove, board, tray, turnEndsAt, turnNumber, currentPlayerId])
}
