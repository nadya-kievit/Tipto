import assert from 'node:assert/strict'
import test from 'node:test'
import { phoneFit, phonePortalPose, phonePose, phoneTarget, playableBounds } from '../src/screens/game/phone/phoneGeometry.js'
import { isValidPlacement } from '../src/screens/game/board/placementRules.js'
import { readFileSync } from 'node:fs'
import { boardSpacing } from '../src/screens/game/board/boardGeometry.js'

const css = readFileSync(new URL('../src/screens/game/styles/board.css', import.meta.url), 'utf8')
const ratios = Object.fromEntries(['gap', 'pad', 'frame'].map(name =>
 [name, Number(css.match(new RegExp(`--board-${name}-ratio:\\s*([\\d.]+)`))[1])]))

const makeBoard = () => Array.from({ length: 16 }, (_, row) => Array.from({ length: 14 }, (_, col) => ({ playable: row >= 2 && row < 14 && col >= 1 && col < 13, occupied: false })))
const piece = { name: 'L', cells: [[0, 0], [1, 0], [1, 1]], rotation: 0, flipped: false }
const me = { id: 'me', pieces: [], startPosition: { row: 4, col: 3 } }

test('phone crops unused borders without losing original board coordinates', () => {
 const board = makeBoard(), bounds = playableBounds(board)
 assert.deepEqual(bounds, { row: 2, col: 1, rows: 12, cols: 12 })
 const rect = { left: 6, top: 60, right: 364, bottom: 418 }
 const pose = { left: 66, top: 120, cx: 96, cy: 150 }
 const target = phoneTarget({ board, me, players: [me], piece, bounds, rect, pose, stride: 30 })
 assert.ok(target.cells.some(c => c.row === 4 && c.col === 3))
 assert.equal(isValidPlacement(board, target.cells, me, true, [me]), true)
})

test('phone boards fit using shared proportional spacing; tray grows into spare height', () => {
 for (const spacing of [ratios, { gap: .15, pad: .75, frame: .05 }]) {
 for (const pixelRatio of [1, 1.25, 1.5, 2, 3]) {
 for (const [width, height] of [[375, 700], [390, 844], [320, 568]]) {
  for (const bounds of [{ rows: 14, cols: 14 }, { rows: 28, cols: 30 }, { rows: 30, cols: 8 }]) {
   const fit = phoneFit(width, height, bounds, 6, spacing, pixelRatio)
   const boardH = fit.height
   const trayH = 2 * (5 * fit.tray + 12) + 20
   assert.ok(boardH + trayH + 66 <= height)
   assert.ok(fit.width <= width - 12 + 1e-9)
   assert.ok(Math.abs(fit.gap * pixelRatio - Math.round(fit.gap * pixelRatio)) < 1e-9)
   assert.ok(fit.tray >= 11 && fit.tray <= 16)
   const nextCell = fit.cell + 1 / pixelRatio
   const next = boardSpacing(nextCell, spacing, pixelRatio)
   const extent = count => count * nextCell + (count - 1) * next.gap + 2 * (next.pad + next.frame)
   assert.ok(extent(bounds.cols) > width - 12 || extent(bounds.rows) > height - 66 - 154)
  }
 }
 }
 }
})

test('drag previews match device-pixel board spacing and align at the right edge', () => {
 const fit = phoneFit(375, 700, { rows: 28, cols: 30 }, 6, ratios, 3)
 const stride = fit.cell + fit.gap
 const drag = { sx: 100, sy: 600, x: 1000, y: 450, piece,
  rect: { left: 6, right: 360, top: 60, bottom: 450 } }
 const pose = phonePose(drag, stride, fit.gap)
 assert.ok(Math.abs(pose.width - (2 * fit.cell + fit.gap)) < 1e-9)
 assert.ok(Math.abs(pose.height - (2 * fit.cell + fit.gap)) < 1e-9)
 assert.ok(Math.abs(pose.left + pose.width - drag.rect.right) < 1e-9)
})

test('amplified motion clamps sides/top and preserves centre through a turn', () => {
 const drag = { sx: 100, sy: 600, x: 120, y: 450, piece, rect: { left: 6, right: 369, top: 60, bottom: 450 } }
 const normal = phonePose(drag, 26)
 assert.equal(normal.cx, 134)
 assert.equal(normal.cy, 289)
 assert.equal(phonePose({ ...drag, piece: { ...piece, rotation: 270 } }, 26).cy, normal.cy)
 const left = phonePose({ ...drag, x: 0, y: 0 }, 26)
 assert.equal(left.left, 6)
 assert.equal(left.top, 60)
 assert.ok(left.push < -12)
 const right = phonePose({ ...drag, x: 375 }, 26)
 assert.equal(right.left + right.width, 369)
 assert.ok(right.push > 12)
})

test('floating pieces cross the board margin and meet both screen portals', () => {
 const edges = { left: 3, right: 372 }
 const drag = { sx: 150, sy: 600, y: 450, piece, rect: { left: 60, right: 315, top: 60, bottom: 450 } }

 const approaching = phonePose({ ...drag, x: 100 }, 26)
 assert.equal(approaching.left, drag.rect.left)
 assert.deepEqual(phonePortalPose(approaching, edges), { left: 39, contact: null })

 const left = phonePose({ ...drag, x: 0 }, 26)
 assert.deepEqual(phonePortalPose(left, edges), { left: edges.left, contact: 'flip' })

 const right = phonePose({ ...drag, x: 375 }, 26)
 assert.equal(right.left + right.width, drag.rect.right)
 assert.deepEqual(phonePortalPose(right, edges), { left: edges.right - right.width, contact: 'rot' })
})

test('phone targets obey real normal, Scout, Connector and reserved-start rules', () => {
 const board = makeBoard(), bounds = playableBounds(board)
 board[7][6] = { occupied: true, playable: true, player: me.id }
 const player = { ...me, pieces: [{ placed: true }] }
 const other = { id: 'other', pieces: [], startPosition: { row: 8, col: 7 } }
 const rect = { left: 6, top: 60, right: 364, bottom: 418 }
 for (const ability of [undefined, 'scout', 'connector']) {
  for (let row = 2; row < 14; row++) for (let col = 1; col < 13; col++) {
   const pose = { left: 6 + (col - 1) * 30, top: 60 + (row - 2) * 30 }
   pose.cx = pose.left + 30; pose.cy = pose.top + 30
   const target = phoneTarget({ board, me: player, players: [player, other], piece: { ...piece, ability }, bounds, rect, pose, stride: 30 })
   if (target) {
    assert.equal(isValidPlacement(board, target.cells, player, false, [player, other], ability), true)
    assert.ok(!target.cells.some(c => c.row === 8 && c.col === 7))
   }
  }
 }
})

test('no target outside the board or when the legal start is beyond the local search', () => {
 const board = makeBoard(), bounds = playableBounds(board), rect = { left: 6, top: 60, right: 364, bottom: 418 }
 const args = { board, me, players: [me], piece, bounds, rect, stride: 30 }
 assert.equal(phoneTarget({ ...args, pose: { left: 300, top: 350, cx: 330, cy: 380 } }), null)
 assert.equal(phoneTarget({ ...args, pose: { left: 0, top: 480, cx: 30, cy: 510 } }), null)
})
