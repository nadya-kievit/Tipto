import test from 'node:test'
import assert from 'node:assert/strict'
import { PHONE_ZOOM as Z, usesZoom, boardSize, clampAt, overview, zoomAt, blendFocus, initZoom, blendView, boardRects, piecePose, advanceZoom, cameraFollow, edgeVelocity, nearestVisiblePlacement, minimapFrame } from '../src/screens/game/phone/phoneZoom.js'
import { isValidPlacement } from '../src/screens/game/board/placementRules.js'
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`)
const size = {
  width: 378,
  height: 550
 },
 bounds = {
  row: 2,
  col: 3,
  rows: 37,
  cols: 35
 }
const board = boardSize(bounds)
test('only four to six players use the new phone camera', () => {
 for (let count = 2; count <= 7; count++) assert.equal(usesZoom({
  players: Array(count)
 }), count >= 4 && count <= 6)
 assert.deepEqual(board, {
  width: 838,
  height: 886
 })
})
test('overview fits both axes; clamping centres short axes and forbids empty edges', () => {
 const view = overview(size, board)
 close(view.s, size.width / board.width)
 close(view.tx, 0)
 assert.ok(view.ty > 0)
 assert.deepEqual(clampAt(size, board, 0.8, 1000, -1000), [0, size.height - board.height * 0.8])
 const tiny = {
  width: 200,
  height: 200
 }
 assert.deepEqual(clampAt(size, tiny, 0.8, -1000, 1000), [(378 - 160) / 2, (550 - 160) / 2])
})
test('view animation uses geometric scale and a focus travelling on a straight line', () => {
 const start = overview(size, board),
  focus = [400, 450],
  end = zoomAt(size, board, focus)
 for (const t of [0, 0.2, 0.5, 0.9, 1]) {
  const current = blendFocus(start, end, focus, t)
  close(current.s, start.s * (end.s / start.s) ** t)
  close(focus[0] * current.s + current.tx, (focus[0] * start.s + start.tx) * (1 - t) + (focus[0] * end.s + end.tx) * t)
  close(focus[1] * current.s + current.ty, (focus[1] * start.s + start.ty) * (1 - t) + (focus[1] * end.s + end.ty) * t)
 }
 const zoom = initZoom(size, board, focus)
 close(blendView(zoom, 0).s, start.s)
 close(blendView(zoom, 1).s, Z.zoom)
})
test('rectangles track the transformed board; push is measured in piece pixels', () => {
 const rect = {
  left: 6,
  top: 58,
  right: 384,
  bottom: 608
 }
 const view = zoomAt(size, board, [400, 450])
 const {
  gr,
  br
 } = boardRects(rect, board, view)
 close(gr.left, rect.left + view.tx)
 assert.ok(br.left >= rect.left && br.right <= rect.right)
 const d = {
  sx: 100,
  sy: 700,
  x: 0,
  y: 500
 }
 const pose = piecePose(d, br, 40, 60)
 close(pose.left, br.left)
 close(pose.push, 100 + (0 - 100) * Z.gain - pose.cx)
 const rotated = piecePose(d, br, 60, 40)
 close(rotated.cy, pose.cy)
})
const input = {
 over: true,
 moved: true,
 speed: 0,
 centre: [100, 100],
 turning: false,
 dt: 0.05
}
const state = zp => ({
 zp,
 zdir: 0,
 stillT: 0,
 offT: 0,
 seenBoard: false
})
test('stillness must be continuous; fast movement and turns prevent new zooms', () => {
 let d = state(0)
 for (let i = 0; i < 4; i++) d = advanceZoom(d, input)
 assert.equal(d.zp, 0)
 d = advanceZoom(d, {
  ...input,
  speed: 300
 })
 assert.equal(d.stillT, 0)
 for (let i = 0; i < 10; i++) d = advanceZoom(d, {
  ...input,
  turning: true
 })
 assert.equal(d.zp, 0)
 for (let i = 0; i < 7; i++) d = advanceZoom(d, input)
 assert.equal(d.zdir, 1)
 assert.ok(d.zp > 0)
})
test('started zooms cannot reverse or stop, including during a portal turn', () => {
 let d = {
  ...state(0),
  stillT: 0.3
 }
 d = advanceZoom(d, input)
 for (let i = 0; i < 25; i++) d = advanceZoom(d, {
  ...input,
  over: false,
  turning: true
 })
 assert.equal(d.zp, 1)
 assert.equal(d.zdir, 0)
 d = {
  ...state(1),
  seenBoard: true
 }
 for (let i = 0; i < 4; i++) d = advanceZoom(d, {
  ...input,
  over: false
 })
 assert.equal(d.zp, 1)
 d = advanceZoom(d, {
  ...input,
  over: false
 })
 assert.equal(d.zdir, -1)
 for (let i = 0; i < 15; i++) d = advanceZoom(d, input)
 assert.equal(d.zp, 0)
 assert.deepEqual(d.holdOut, [100, 100])
 for (let i = 0; i < 20; i++) d = advanceZoom(d, input)
 assert.equal(d.zp, 0)
 d = advanceZoom(d, {
  ...input,
  centre: [171, 100]
 })
 assert.equal(d.zdir, 1)
})
test('reduced motion jumps straight to the endpoint after the dwell', () => {
 const d = advanceZoom({
  ...state(0),
  stillT: 0.3
 }, {
  ...input,
  reduced: true
 })
 assert.equal(d.zp, 1)
 assert.equal(d.zdir, 0)
})
test('camera dwells and ramps at all four edges; portal push suppresses side follow', () => {
 const rect = {
  left: 0,
  top: 0,
  right: 378,
  bottom: 550
 }
 const view = {
  s: 0.8,
  tx: -100,
  ty: -100
 }
 const cases = [[{
  left: 0,
  top: 200,
  width: 30,
  height: 30,
  push: 0
 }, 'dx', 1], [{
  left: 348,
  top: 200,
  width: 30,
  height: 30,
  push: 0
 }, 'dx', -1], [{
  left: 150,
  top: 0,
  width: 30,
  height: 30,
  push: 0
 }, 'dy', 1], [{
  left: 150,
  top: 520,
  width: 30,
  height: 30,
  push: 0
 }, 'dy', -1]]
 for (const [pose, axis, sign] of cases) {
  let edges = {},
   result
  for (let i = 0; i < 3; i++) {
   result = cameraFollow(edges, {
    pose,
    rect,
    view,
    size,
    board,
    dt: 0.05,
    active: true
   })
   edges = result.edges
  }
  close(result[axis], 0)
  for (let i = 0; i < 20; i++) {
   result = cameraFollow(edges, {
    pose,
    rect,
    view,
    size,
    board,
    dt: 0.05,
    active: true
   })
   edges = result.edges
  }
  assert.ok(result[axis] * sign > 0)
  result = cameraFollow(edges, {
   pose,
   rect,
   view,
   size,
   board,
   dt: 0.05,
   active: false
  })
  assert.equal(result.dx, 0)
  assert.equal(result.dy, 0)
 }
 const pushed = cameraFollow({
  l: 1
 }, {
  pose: {
   ...cases[0][0],
   push: -10
  },
  rect,
  view,
  size,
  board,
  dt: 0.05,
  active: true
 })
 assert.equal(pushed.dx, 0)
 assert.equal(pushed.edges.l, 0)
 assert.equal(edgeVelocity(64), 0)
 assert.equal(edgeVelocity(0), 420)
})
const makeBoard = () => Array.from({
 length: 30
}, () => Array.from({
 length: 30
}, () => ({
 playable: true,
 occupied: false
})))
const me = {
 id: 'me',
 pieces: [],
 startPosition: {
  row: 22,
  col: 23
 }
}
const piece = {
 name: 'L',
 cells: [[0, 0], [1, 0], [1, 1]]
}
const targetArgs = board => ({
 board,
 me,
 players: [me],
 piece,
 bounds: {
  row: 0,
  col: 0,
  rows: 30,
  cols: 30
 },
 gr: {
  left: 0,
  top: 0
 },
 rect: {
  left: 0,
  top: 0,
  right: 720,
  bottom: 720
 },
 pose: {
  left: 24,
  top: 24
 },
 scale: 1
})
test('ring search has no local distance limit and uses the real first-move rule', () => {
 const board = makeBoard(),
  args = targetArgs(board)
 const target = nearestVisiblePlacement(args)
 assert.ok(target)
 assert.ok(target.cells.some(c => c.row === 22 && c.col === 23))
 assert.equal(isValidPlacement(board, target.cells, me, true, [me]), true)
 assert.equal(nearestVisiblePlacement({
  ...args,
  rect: {
   left: 0,
   top: 0,
   right: 240,
   bottom: 240
  }
 }), null)
})
test('ring search filters visibility every frame, even when using an orientation cache', () => {
 const board = makeBoard(),
  args = targetArgs(board),
  cache = new Map()
 assert.ok(nearestVisiblePlacement({
  ...args,
  cache
 }))
 assert.equal(nearestVisiblePlacement({
  ...args,
  cache,
  rect: {
   left: 0,
   top: 0,
   right: 100,
   bottom: 100
  }
 }), null)
 const cropped = {
  row: 20,
  col: 20,
  rows: 10,
  cols: 10
 }
 const target = nearestVisiblePlacement({
  ...args,
  cache: new Map(),
  bounds: cropped,
  rect: {
   left: 0,
   top: 0,
   right: 240,
   bottom: 240
  }
 })
 assert.ok(target.cells.some(c => c.row === 22 && c.col === 23))
})
test('normal, Scout and Connector search results obey opponent reservations and edge rules', () => {
 const board = makeBoard()
 board[12][12] = {
  occupied: true,
  playable: true,
  player: 'me'
 }
 const player = {
  ...me,
  pieces: [{
   placed: true
  }]
 }
 const other = {
  id: 'other',
  pieces: [],
  startPosition: {
   row: 13,
   col: 13
  }
 }
 for (const ability of [undefined, 'scout', 'connector']) for (const rotation of [0, 90, 180, 270]) {
  const args = {
   ...targetArgs(board),
   me: player,
   players: [player, other],
   piece: {
    ...piece,
    ability,
    rotation
   },
   pose: {
    left: 300,
    top: 300
   }
  }
  const target = nearestVisiblePlacement(args)
  assert.ok(target)
  assert.equal(isValidPlacement(board, target.cells, player, false, [player, other], ability), true)
 }
})
test('minimap omits its frame when the view covers the entire board', () => {
 assert.equal(minimapFrame(size, board, overview(size, board), bounds), null)
 const frame = minimapFrame(size, board, zoomAt(size, board, [400, 450]), bounds)
 assert.ok(frame && frame.width < bounds.cols * Z.miniCell)
})
