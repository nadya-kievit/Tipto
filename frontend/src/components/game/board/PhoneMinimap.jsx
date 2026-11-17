import { useLayoutEffect, useRef } from 'react'
import { getPlayerColorHex } from '../../../game/playerColors'
import { PHONE_ZOOM as Z, minimapFrame } from '../../../game/phoneZoom'
export default function PhoneMinimap({
 cameraRef,
 board,
 players,
 bounds,
 pendingPlacement
}) {
 const canvasRef = useRef(null)
 useLayoutEffect(() => {
  const camera = cameraRef.current,
   canvas = canvasRef.current
  const draw = () => {
   if (!camera.view) return
   const dpr = window.devicePixelRatio || 1,
    w = bounds.cols * Z.miniCell,
    h = bounds.rows * Z.miniCell
   if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
   }
   canvas.style.width = `${w}px`
   canvas.style.height = `${h}px`
   const ctx = canvas.getContext('2d')
   ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
   ctx.clearRect(0, 0, w, h)
   const starts = new Map(players.filter(p => p.startPosition).map(p => [`${p.startPosition.row},${p.startPosition.col}`, getPlayerColorHex(p.color)]))
   const pending = new Set((pendingPlacement?.cells || []).map(c => `${c.row},${c.col}`))
   const owners = new Map(players.map(p => [p.id, getPlayerColorHex(p.color)]))
   for (let r = 0; r < bounds.rows; r++) for (let c = 0; c < bounds.cols; c++) {
    const value = board[r + bounds.row][c + bounds.col],
     key = `${r + bounds.row},${c + bounds.col}`
    if (value.playable === false) continue
    ctx.fillStyle = pending.has(key) ? getPlayerColorHex(pendingPlacement.color) : value.occupied ? (value.color ? getPlayerColorHex(value.color) : owners.get(value.player)) || '#4a5060' : starts.get(key) || '#4a5060'
    ctx.fillRect(c * Z.miniCell, r * Z.miniCell, Z.miniCell - 0.4, Z.miniCell - 0.4)
   }
   const frame = minimapFrame(camera.size, camera.board, camera.view, bounds)
   canvas.dataset.hasFrame = Boolean(frame)
   if (frame) {
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.strokeRect(frame.x, frame.y, frame.width, frame.height)
   }
  }
  camera.listeners.add(draw)
  draw()
  return () => camera.listeners.delete(draw)
 }, [cameraRef, board, players, bounds, pendingPlacement])
 return <div className="phoneMini" role="button" tabIndex={0} aria-label="Board minimap. Drag to move the view; tap to show the whole board.">
 <canvas ref={canvasRef} aria-hidden="true" />
 <span className="phoneMiniExpand" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" /></svg></span>
</div>
}
