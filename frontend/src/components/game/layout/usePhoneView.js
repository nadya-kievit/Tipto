import { useLayoutEffect, useRef } from 'react'
import { PHONE_ZOOM as Z, boardSize, clampAt, overview, zoomAt, blendFocus, easeView, boardRects } from '../../../game/phoneZoom'

// All camera animation and pointer state stays outside React. Listeners (the
// minimap and carried piece) paint in the same frame as the board transform.
export default function usePhoneView(rootRef, bounds, enabled) {
 const controlRef = useRef({
  listeners: new Set()
 })
 const {
  rows,
  cols
 } = bounds
 useLayoutEffect(() => {
  if (!enabled) return
  const root = rootRef.current,
   windowEl = root.querySelector('.phoneView')
  const boardEl = root.querySelector('.phoneZoomBoard'),
   control = controlRef.current
  const board = boardSize({
    rows,
    cols
   }),
   size = {
    width: 1,
    height: 1
   }
  const view = {
   s: 1,
   tx: 0,
   ty: 0,
   mode: 'over'
  }
  let animation = 0,
   animationEnd = null,
   pan = null,
   mini = null,
   busy = false,
   paintDrag = null
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const apply = () => {
   boardEl.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`
   root.classList.toggle('zoomed', view.mode === 'zoom')
   root.dataset.viewMode = view.mode
   for (const listener of control.listeners) listener()
   paintDrag?.()
  }
  const stop = (complete = false) => {
   cancelAnimationFrame(animation)
   animation = 0
   if (complete && animationEnd) {
    Object.assign(view, animationEnd)
    apply()
   }
   animationEnd = null
  }
  const goView = (end, focus, animate = true, done) => {
   if (control.destroyed) return
   stop()
   const [tx, ty] = clampAt(size, board, end.s, end.tx, end.ty)
   end = {
    ...end,
    tx,
    ty
   }
   const start = {
    ...view
   }
   view.mode = end.mode
   if (!animate || reduced() || Math.abs(start.s - end.s) < 0.001 && Math.abs(start.tx - tx) < 1 && Math.abs(start.ty - ty) < 1) {
    Object.assign(view, end)
    apply()
    done?.()
    return
   }
   animationEnd = end
   const t0 = performance.now()
   const frame = now => {
    const t = Math.min(1, (now - t0) / Z.viewMs)
    Object.assign(view, blendFocus(start, end, focus, easeView(t)))
    apply()
    if (t < 1) animation = requestAnimationFrame(frame)
    else {
     animation = 0
     animationEnd = null
     Object.assign(view, end)
     apply()
     done?.()
    }
   }
   animation = requestAnimationFrame(frame)
  }
  const showOverview = (animate = true, done) => {
   const focus = [(size.width / 2 - view.tx) / view.s, (size.height / 2 - view.ty) / view.s]
   goView(overview(size, board), focus, animate, done)
  }
  const zoomTo = (focus, animate = true) => goView(zoomAt(size, board, focus), focus, animate)
  const clampView = () => {
   [view.tx, view.ty] = clampAt(size, board, view.s, view.tx, view.ty)
  }
  Object.assign(control, {
   destroyed: false,
   view,
   size,
   board,
   apply,
   stop,
   goView,
   showOverview,
   zoomTo,
   clampView,
   rects: () => boardRects(windowEl.getBoundingClientRect(), board, view),
   windowRect: () => windowEl.getBoundingClientRect(),
   setBusy: value => {
    busy = value
    pan = null
    mini = null
   },
   isBusy: () => busy,
   setDragPainter: callback => {
    paintDrag = callback
   }
  })
  const layout = () => {
   if (!windowEl.clientWidth || !windowEl.clientHeight) return
   stop()
   size.width = windowEl.clientWidth
   size.height = windowEl.clientHeight
   if (view.mode === 'zoom') {
    clampView()
    apply()
   } else showOverview(false)
  }
  const down = event => {
   if (busy || event.button !== 0 || event.isPrimary === false) return
   stop()
   windowEl.setPointerCapture(event.pointerId)
   pan = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    tx: view.tx,
    ty: view.ty,
    moved: false
   }
  }
  const move = event => {
   if (!pan || pan.id !== event.pointerId) return
   const dx = event.clientX - pan.x,
    dy = event.clientY - pan.y
   if (Math.hypot(dx, dy) > 6) pan.moved = true
   if (pan.moved && view.mode === 'zoom') {
    view.tx = pan.tx + dx
    view.ty = pan.ty + dy
    clampView()
    apply()
   }
  }
  const up = event => {
   if (!pan || pan.id !== event.pointerId) return
   const tap = !pan.moved
   pan = null
   if (!tap) return
   const rect = windowEl.getBoundingClientRect()
   if (view.mode === 'over') zoomTo([(event.clientX - rect.left - view.tx) / view.s, (event.clientY - rect.top - view.ty) / view.s])
   else showOverview()
  }
  const cancelled = () => {
   pan = null
   mini = null
  }
  const additionalTouch = event => {
   if (event.pointerType === 'touch' && !event.isPrimary) cancelled()
  }
  const miniEl = root.querySelector('.phoneMini'),
   canvas = miniEl.querySelector('canvas')
  const miniDown = event => {
   if (busy || event.isPrimary === false || event.button !== 0) return
   event.stopPropagation()
   stop()
   miniEl.setPointerCapture(event.pointerId)
   mini = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    moved: false
   }
  }
  const miniMove = event => {
   if (!mini || mini.id !== event.pointerId) return
   if (Math.hypot(event.clientX - mini.x, event.clientY - mini.y) > 5) mini.moved = true
   if (!mini.moved) return
   const rect = canvas.getBoundingClientRect()
   zoomTo([(event.clientX - rect.left) / Z.miniCell * Z.step, (event.clientY - rect.top) / Z.miniCell * Z.step], false)
  }
  const miniUp = event => {
   if (!mini || mini.id !== event.pointerId) return
   const tap = !mini.moved
   mini = null
   if (tap) showOverview()
  }
  const key = event => {
   if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    showOverview()
   }
  }
  windowEl.addEventListener('pointerdown', down)
  windowEl.addEventListener('pointermove', move)
  windowEl.addEventListener('pointerup', up)
  windowEl.addEventListener('pointercancel', cancelled)
  windowEl.addEventListener('lostpointercapture', cancelled)
  miniEl.addEventListener('pointerdown', miniDown)
  miniEl.addEventListener('pointermove', miniMove)
  miniEl.addEventListener('pointerup', miniUp)
  miniEl.addEventListener('pointercancel', cancelled)
  miniEl.addEventListener('lostpointercapture', cancelled)
  miniEl.addEventListener('keydown', key)
  root.addEventListener('pointerdown', additionalTouch, true)
  const observer = new ResizeObserver(layout)
  observer.observe(windowEl)
  layout()
  return () => {
   control.destroyed = true
   stop()
   observer.disconnect()
   paintDrag = null
   windowEl.removeEventListener('pointerdown', down)
   windowEl.removeEventListener('pointermove', move)
   windowEl.removeEventListener('pointerup', up)
   windowEl.removeEventListener('pointercancel', cancelled)
   windowEl.removeEventListener('lostpointercapture', cancelled)
   miniEl.removeEventListener('pointerdown', miniDown)
   miniEl.removeEventListener('pointermove', miniMove)
   miniEl.removeEventListener('pointerup', miniUp)
   miniEl.removeEventListener('pointercancel', cancelled)
   miniEl.removeEventListener('lostpointercapture', cancelled)
   miniEl.removeEventListener('keydown', key)
   root.removeEventListener('pointerdown', additionalTouch, true)
  }
 }, [rootRef, rows, cols, enabled])
 return controlRef
}
