import { displayCells } from '../piece/piecePresentation.js'
import { isValidPlacement } from '../board/placementRules.js'

// Reference geometry and timings from docs/mockups/game-phone-zoom.html.
export const PHONE_ZOOM = Object.freeze({
 cell: 22,
 gap: 2,
 step: 24,
 zoom: 0.8,
 viewMs: 600,
 gain: 1.7,
 startGap: 16,
 startHalf: 40,
 push: 10,
 slow: 150,
 stillSeconds: 0.25,
 inSeconds: 0.9,
 outSeconds: 0.6,
 offSeconds: 0.2,
 holdOut: 70,
 turnQuietMs: 600,
 band: 64,
 maxVelocity: 420,
 exponent: 1.5,
 sideDwell: 0.4,
 verticalDwell: 0.15,
 rampSeconds: 0.3,
 calm: 7,
 miniCell: 2.4,
 pickMs: 120,
 repeatDelayMs: 600,
 repeatMs: 400
})
export const usesZoom = game => game.players.length >= 4 && game.players.length <= 6
export const smoothstep = t => t * t * (3 - 2 * t)
export const easeView = t => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
const clamp = (n, low, high) => Math.min(high, Math.max(low, n))
export function boardSize(bounds) {
 return {
  width: bounds.cols * PHONE_ZOOM.step - PHONE_ZOOM.gap,
  height: bounds.rows * PHONE_ZOOM.step - PHONE_ZOOM.gap
 }
}
export function clampAt(size, board, s, tx, ty) {
 const w = board.width * s,
  h = board.height * s
 return [w <= size.width ? (size.width - w) / 2 : clamp(tx, size.width - w, 0), h <= size.height ? (size.height - h) / 2 : clamp(ty, size.height - h, 0)]
}
export function overview(size, board) {
 const s = Math.min(size.width / board.width, size.height / board.height)
 const [tx, ty] = clampAt(size, board, s, 0, 0)
 return {
  s,
  tx,
  ty,
  mode: 'over'
 }
}
export function zoomAt(size, board, focus) {
 const s = PHONE_ZOOM.zoom
 const [tx, ty] = clampAt(size, board, s, size.width / 2 - focus[0] * s, size.height / 2 - focus[1] * s)
 return {
  s,
  tx,
  ty,
  mode: 'zoom'
 }
}

// One board point travels on a straight screen-space line as scale changes
// geometrically. Used by both ordinary animation and continuous drag zoom.
export function blendFocus(start, end, focus, t) {
 const s = start.s * (end.s / start.s) ** t
 const axis = (point, a, b) => (point * start.s + a) * (1 - t) + (point * end.s + b) * t - point * s
 return {
  s,
  tx: axis(focus[0], start.tx, end.tx),
  ty: axis(focus[1], start.ty, end.ty)
 }
}
export function initZoom(size, board, focus, current) {
 return {
  start: overview(size, board),
  end: current || zoomAt(size, board, focus),
  focus
 }
}
export const blendView = (z, progress) => blendFocus(z.start, z.end, z.focus, smoothstep(progress))
export function boardRects(rect, board, view) {
 const gr = {
  left: rect.left + view.tx,
  top: rect.top + view.ty,
  right: rect.left + view.tx + board.width * view.s,
  bottom: rect.top + view.ty + board.height * view.s
 }
 const br = {
  left: Math.max(gr.left, rect.left),
  right: Math.min(gr.right, rect.right),
  top: Math.max(gr.top, rect.top),
  bottom: Math.min(gr.bottom, rect.bottom)
 }
 return {
  gr,
  br
 }
}
export function piecePose(drag, br, width, height) {
 const rawX = drag.sx + (drag.x - drag.sx) * PHONE_ZOOM.gain
 const cx = Math.min(br.right - width / 2, Math.max(br.left + width / 2, rawX))
 const cy = Math.max(br.top + height / 2, drag.sy - PHONE_ZOOM.startGap - PHONE_ZOOM.startHalf + (drag.y - drag.sy) * PHONE_ZOOM.gain)
 return {
  left: cx - width / 2,
  top: cy - height / 2,
  cx,
  cy,
  width,
  height,
  push: rawX - cx
 }
}
export const isOverBoard = (pose, br) => pose.cx > br.left && pose.cx < br.right && pose.cy > br.top && pose.cy < br.bottom

// A latched direction always reaches its endpoint, even after a turn or a move
// off the board. Only a NEW zoom may be inhibited by a portal or recent turn.
export function advanceZoom(state, {
 over,
 moved,
 speed,
 centre,
 turning,
 dt,
 reduced = false
}) {
 const next = {
  ...state,
  seenBoard: state.seenBoard || over
 }
 let dir = 0
 if (over) {
  next.offT = 0
  const holding = next.holdOut && Math.hypot(centre[0] - next.holdOut[0], centre[1] - next.holdOut[1]) < PHONE_ZOOM.holdOut
  if (!holding) next.holdOut = null
  next.stillT = speed < PHONE_ZOOM.slow ? (next.stillT || 0) + dt : 0
  if (next.stillT > PHONE_ZOOM.stillSeconds && !holding) dir = 1
 } else if (moved && next.seenBoard && next.zp > 0) {
  next.stillT = 0
  next.offT = (next.offT || 0) + dt
  if (next.offT > PHONE_ZOOM.offSeconds) dir = -1
 } else {
  next.offT = 0
  next.stillT = 0
 }
 if (turning) {
  dir = 0
  next.stillT = 0
 }
 if (dir === 1 && next.zp >= 1 || dir === -1 && next.zp <= 0) dir = 0
 if (next.zdir) dir = next.zdir
 else if (dir) next.zdir = dir
 if (dir === -1 && !next.holdOut) next.holdOut = centre
 if (dir) next.zp = reduced ? dir > 0 ? 1 : 0 : clamp(next.zp + dir * dt / (dir > 0 ? PHONE_ZOOM.inSeconds : PHONE_ZOOM.outSeconds), 0, 1)
 if (next.zp === 1 && next.zdir === 1 || next.zp === 0 && next.zdir === -1) next.zdir = 0
 return next
}
export function edgeVelocity(distance) {
 return distance >= PHONE_ZOOM.band ? 0 : PHONE_ZOOM.maxVelocity * (1 - Math.max(0, distance) / PHONE_ZOOM.band) ** PHONE_ZOOM.exponent
}
export function cameraFollow(edges, {
 pose,
 rect,
 view,
 size,
 board,
 dt,
 active
}) {
 const ev = edgeVelocity
 const calm = active && Math.abs(pose.push) < PHONE_ZOOM.calm
 const distances = {
  l: pose.left - rect.left,
  r: rect.right - pose.left - pose.width,
  u: pose.top - rect.top,
  d: rect.bottom - pose.top - pose.height
 }
 const possible = {
  l: view.tx < -0.5,
  r: view.tx > size.width - board.width * view.s + 0.5,
  u: view.ty < -0.5,
  d: view.ty > size.height - board.height * view.s + 0.5
 }
 const next = {},
  velocity = {}
 for (const key of ['l', 'r', 'u', 'd']) {
  const side = key === 'l' || key === 'r'
  const on = active && possible[key] && (!side || calm) && ev(distances[key]) > 0
  next[key] = on ? (edges[key] || 0) + dt : 0
  const need = side ? PHONE_ZOOM.sideDwell : PHONE_ZOOM.verticalDwell
  velocity[key] = ev(distances[key]) * clamp((next[key] - need) / PHONE_ZOOM.rampSeconds, 0, 1)
 }
 return {
  edges: next,
  dx: (velocity.l - velocity.r) * dt,
  dy: (velocity.u - velocity.d) * dt
 }
}
function* ring(row, col, radius) {
 for (let r = row - radius; r <= row + radius; r++) {
  if (r === row - radius || r === row + radius) {
   for (let c = col - radius; c <= col + radius; c++) yield [r, c]
  } else {
   yield [r, col - radius]
   yield [r, col + radius]
  }
 }
}

// Cache only rule validation per orientation; visibility/distance are evaluated
// afresh every frame, so a moving camera cannot leave a stale drop spot behind.
export function nearestVisiblePlacement({
 board,
 me,
 players,
 piece,
 bounds,
 gr,
 rect,
 pose,
 scale,
 cache = new Map()
}) {
 const cells = displayCells(piece.cells, piece.rotation, piece.flipped)
 const rows = Math.max(...cells.map(([r]) => r)) + 1,
  cols = Math.max(...cells.map(([, c]) => c)) + 1
 const step = PHONE_ZOOM.step * scale
 const fx = (pose.left - gr.left) / step,
  fy = (pose.top - gr.top) / step
 const ox = Math.round(fx),
  oy = Math.round(fy)
 const x0 = Math.max(0, Math.ceil((rect.left - gr.left) / step - 0.25))
 const x1 = Math.min(bounds.cols, Math.floor((rect.right - gr.left) / step + 0.25))
 const y0 = Math.max(0, Math.ceil((rect.top - gr.top) / step - 0.25))
 const y1 = Math.min(bounds.rows, Math.floor((rect.bottom - gr.top) / step + 0.25))
 let best = null,
  bestD = Infinity
 const max = Math.max(Math.abs(oy - y0), Math.abs(oy - y1), Math.abs(ox - x0), Math.abs(ox - x1)) + 1
 for (let radius = 0; radius <= max; radius++) {
  if (best && radius > Math.sqrt(bestD) + 1) break
  for (const [r, c] of ring(oy, ox, radius)) {
   if (c < x0 || r < y0 || c + cols > x1 || r + rows > y1) continue
   const distance = (c - fx) ** 2 + (r - fy) ** 2
   if (distance >= bestD) continue
   const key = `${piece.rotation || 0}:${!!piece.flipped}:${r},${c}`
   if (!cache.has(key)) {
    const placed = cells.map(([dr, dc]) => ({
     row: bounds.row + r + dr,
     col: bounds.col + c + dc
    }))
    cache.set(key, isValidPlacement(board, placed, me, !me.pieces.some(p => p.placed), players, piece.ability) ? placed : null)
   }
   if (cache.get(key)) {
    bestD = distance
    best = {
     key,
     cells: cache.get(key)
    }
   }
  }
 }
 return best
}
export function minimapFrame(size, board, view, bounds) {
 const k = PHONE_ZOOM.miniCell / PHONE_ZOOM.step
 const w = bounds.cols * PHONE_ZOOM.miniCell,
  h = bounds.rows * PHONE_ZOOM.miniCell
 const width = size.width / view.s * k,
  height = size.height / view.s * k
 if (width >= w - 1.5 && height >= h - 1.5) return null
 return {
  x: Math.max(0.75, -view.tx / view.s * k),
  y: Math.max(0.75, -view.ty / view.s * k),
  width: Math.min(w - 1.5, width),
  height: Math.min(h - 1.5, height)
 }
}
