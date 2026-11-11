import assert from 'node:assert/strict'
import test from 'node:test'
import { phoneFit, phonePose, phoneTarget, playableBounds } from '../src/game/phoneGeometry.js'
import { isValidPlacement } from '../src/game/placementRules.js'

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

test('tray grows only into spare height; board uses largest integer cell', () => {
 for (const [width, height] of [[375, 700], [390, 844], [320, 568]]) {
  for (const bounds of [{ rows: 14, cols: 14 }, { rows: 28, cols: 30 }, { rows: 30, cols: 8 }]) {
   const fit = phoneFit(width, height, bounds)
   const boardH = bounds.rows * fit.cell + (bounds.rows - 1) * 2
   const trayH = 2 * (5 * fit.tray + 12) + 20
   assert.ok(boardH + trayH + 66 <= height)
   assert.ok(bounds.cols * fit.cell + (bounds.cols - 1) * 2 <= width - 12)
   assert.ok(fit.tray >= 11 && fit.tray <= 16)
   assert.equal(fit.cell, Math.floor(Math.min((width - 12 - (bounds.cols - 1) * 2) / bounds.cols,
    (height - 66 - 154 - (bounds.rows - 1) * 2) / bounds.rows)))
  }
 }
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
