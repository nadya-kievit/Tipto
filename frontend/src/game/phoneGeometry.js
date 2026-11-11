import { displayCells } from './piecePresentation.js'
import { isValidPlacement } from './placementRules.js'

export function playableBounds(board) {
 const cells = board.flatMap((row, r) => row.flatMap((cell, c) => cell.playable === false ? [] : [[r, c]]))
 if (!cells.length) return { row: 0, col: 0, rows: 1, cols: 1 }
 const row = Math.min(...cells.map(([r]) => r)), col = Math.min(...cells.map(([, c]) => c))
 return { row, col, rows: Math.max(...cells.map(([r]) => r)) - row + 1, cols: Math.max(...cells.map(([, c]) => c)) - col + 1 }
}

// Reserve the smallest tray first. Extra tray height never costs a board pixel.
export function phoneFit(width, height, bounds, bottomPadding = 6) {
 const trayHeight = size => 2 * (5 * size + 12) + 2 + 4 + bottomPadding + 8
 const cell = Math.max(1, Math.floor(Math.min((width - 12 - 2 * (bounds.cols - 1)) / bounds.cols,
  (height - 50 - 16 - trayHeight(11) - 2 * (bounds.rows - 1)) / bounds.rows)))
 const boardHeight = bounds.rows * cell + 2 * (bounds.rows - 1)
 let tray = 11
 while (tray < 16 && height - 50 - 16 - trayHeight(tray + 1) >= boardHeight) tray++
 return { cell, tray }
}

export function phonePose(drag, stride) {
 const oriented = displayCells(drag.piece.cells, drag.piece.rotation, drag.piece.flipped)
 const width = (Math.max(...oriented.map(([, c]) => c)) + 1) * stride
 const height = (Math.max(...oriented.map(([r]) => r)) + 1) * stride
 const rawX = drag.sx + (drag.x - drag.sx) * 1.7
 const cx = Math.min(drag.rect.right - width / 2, Math.max(drag.rect.left + width / 2, rawX))
 const cy = Math.max(drag.rect.top + height / 2, drag.sy - 56 + (drag.y - drag.sy) * 1.7)
 return { left: cx - width / 2, top: cy - height / 2, width, height, cx, cy, push: (rawX - cx) / 1.7 }
}

export function phoneTarget({ board, me, players, piece, bounds, rect, pose, stride }) {
 if (pose.cx <= rect.left || pose.cx >= rect.right || pose.cy <= rect.top || pose.cy >= rect.bottom) return null
 const row = (pose.top - rect.top) / stride + bounds.row
 const col = (pose.left - rect.left) / stride + bounds.col
 const oriented = displayCells(piece.cells, piece.rotation, piece.flipped)
 let best = null, distance = Infinity
 for (let r = Math.round(row) - 3; r <= Math.round(row) + 3; r++) {
  for (let c = Math.round(col) - 3; c <= Math.round(col) + 3; c++) {
   const d = (r - row) ** 2 + (c - col) ** 2
   if (d >= distance) continue
   const cells = oriented.map(([dr, dc]) => ({ row: r + dr, col: c + dc }))
   if (!isValidPlacement(board, cells, me, !me.pieces.some(p => p.placed), players, piece.ability)) continue
   best = { key: `${r},${c}:${piece.rotation || 0}:${!!piece.flipped}`, cells }
   distance = d
  }
 }
 return best
}
