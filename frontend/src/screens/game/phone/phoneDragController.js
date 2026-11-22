import { flushSync } from 'react-dom'
import { horizontalFlip } from '../piece/piecePresentation'
import { phonePortalPose, phonePose, phoneTarget } from './phoneGeometry'
import { pixelOffset } from '../board/boardGeometry'
import {
	clearDragVisuals,
	drawFloatingPiece,
	paintEdgeHighlights,
	paintPlacementPreview,
	showDragVisuals,
} from './phoneDragVisuals'

const PICKUP_DELAY_MS = 120
const RETURN_DURATION_MS = 190
const EDGE_REPEAT_DELAY_MS = 600
const EDGE_REPEAT_INTERVAL_MS = 400
const PORTAL_RELEASE_DISTANCE = 6

function readBoardRect(root) {
	const grid = root.querySelector('.phoneBoard')
	const { left, top, right, bottom } = grid.getBoundingClientRect()
	const inset = parseFloat(getComputedStyle(grid).paddingLeft)
	return {
		left: left + inset,
		top: top + inset,
		right: right - inset,
		bottom: bottom - inset,
	}
}

// Pointer positions and animation state stay outside React.
export function createPhoneDragController(root, getConfig) {
	const tray = root.querySelector('.tray')
	const floatingPiece = root.querySelector('.float')
	const ghost = root.querySelector('.ghostLayer')
	const portals = [...root.querySelectorAll('.portal, .dh')]
	const flipPortal = root.querySelector('.portal[data-side="flip"]')
	const rotatePortal = root.querySelector('.portal[data-side="rot"]')

	let pending = null
	let drag = null
	let frame = 0
	let returnTimer = 0
	let returning = null

	function canDrag() {
		const { canMove, game: { turnEndsAt } } = getConfig()
		return canMove && (!turnEndsAt || Date.now() < turnEndsAt)
	}

	function cancelPickup() {
		if (!pending) return

		clearTimeout(pending.timer)
		pending.element.classList.remove('touch')
		pending = null
	}

	function clearReturn() {
		clearTimeout(returnTimer)
		returning?.classList.remove('lifted', 'home')
		returning = null
		floatingPiece.classList.remove('back')
		floatingPiece.hidden = true
	}

	function animateReturn({ element, home, traySize, stride }) {
		returning = element
		element.classList.add('lifted')
		floatingPiece.classList.add('back')
		floatingPiece.style.transform = `translate3d(${home.left}px, ${home.top}px, 0) scale(${traySize / stride})`
		returnTimer = setTimeout(clearReturn, RETURN_DURATION_MS)
	}

	function stopFrame() {
		cancelAnimationFrame(frame)
		frame = 0
	}

	function finishDrag({ attemptPlacement = false, animate = true, commitOrientation = true } = {}) {
		cancelPickup()
		if (!drag) {
			if (!animate) clearReturn()
			return
		}

		const finished = drag
		const { element, pointerId, piece, target, moved, turns } = finished
		drag = null
		stopFrame()
		clearTimeout(finished.repeatTimer)
		clearDragVisuals(root, portals, ghost, element)
		if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)

		if (commitOrientation) {
			flushSync(() => getConfig().onStage(piece.name))
			for (const action of turns) {
				flushSync(() => {
					if (action === 'rot') getConfig().onRotate(270)
					else getConfig().onFlip()
				})
			}
		}

		if (attemptPlacement && canDrag() && moved && target) {
			floatingPiece.hidden = true
			getConfig().onPlace(target.cells, piece)
		} else if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			animateReturn(finished)
		} else {
			floatingPiece.hidden = true
		}
	}

	function abort() {
		finishDrag({ animate: false, commitOrientation: false })
	}

	function scheduleFrame() {
		if (!frame) frame = requestAnimationFrame(updateDrag)
	}

	function turnPiece(side) {
		const { piece } = drag
		if (side === 'rot') {
			drag.piece = { ...piece, rotation: ((piece.rotation || 0) + 270) % 360 }
		} else {
			drag.piece = { ...piece, ...horizontalFlip(piece.rotation || 0, piece.flipped) }
		}
		drag.turns.push(side)

		const shape = drawFloatingPiece(floatingPiece, drag.piece, drag.cell, getConfig().color)
		shape.classList.add(side === 'rot' ? 'anim-rot' : 'anim-flip')
		drag.target = null
		drag.targetKey = undefined
		navigator.vibrate?.(12)
		scheduleFrame()
	}

	function repeatTurn(side) {
		if (!drag || drag.edgeSide !== side || !canDrag()) return

		turnPiece(side)
		drag.repeatTimer = setTimeout(() => repeatTurn(side), EDGE_REPEAT_INTERVAL_MS)
	}

	function updateEdgeInteraction(pose, portalPose) {
		const besideBoard = pose.cy <= drag.rect.bottom
		const push = besideBoard ? pose.push : 0
		const { left, right } = drag.portalEdges
		let side = null
		if (besideBoard && drag.moved) {
			// Keep contact through a turn, which may change the piece's width.
			const heldFlip = drag.edgeSide === 'flip' && drag.x <= drag.edgeContactX + PORTAL_RELEASE_DISTANCE
			const heldRotate = drag.edgeSide === 'rot' && drag.x >= drag.edgeContactX - PORTAL_RELEASE_DISTANCE
			if (heldFlip || heldRotate) side = drag.edgeSide
			else if (Math.abs(push) >= 12) side = portalPose.contact
		}

		const proximity = {
			flip: besideBoard ? Math.max(0, 1 - (portalPose.left - left) / 90) : 0,
			rot: besideBoard ? Math.max(0, 1 - (right - portalPose.left - pose.width) / 90) : 0,
		}
		paintEdgeHighlights(portals, side, proximity)

		if (side !== drag.edgeSide) {
			clearTimeout(drag.repeatTimer)
			drag.repeatTimer = null
			drag.edgeSide = side
			drag.edgeContactX = drag.x
		}
		if (!side) {
			if (Math.abs(push) < 3.6) drag.armed = true
			return null
		}

		if (drag.targetKey !== 'turning') {
			ghost.hidden = true
			drag.element.classList.remove('home')
			drag.target = null
			drag.targetKey = 'turning'
		}
		if (drag.armed) {
			drag.armed = false
			turnPiece(side)
			drag.repeatTimer = setTimeout(() => repeatTurn(side), EDGE_REPEAT_DELAY_MS)
		}
		return side
	}

	function updatePlacementPreview(pose) {
		const { board, me, game: { players }, bounds } = getConfig()
		const { moved, piece, rect, stride } = drag
		const target = moved ? phoneTarget({ board, me, players, piece, bounds, rect, pose, stride }) : null
		const targetKey = target?.key || null
		if (targetKey === drag.targetKey) return

		drag.target = target
		drag.targetKey = targetKey
		paintPlacementPreview(ghost, drag, bounds, target)
	}

	function updateDrag() {
		frame = 0
		if (!drag) return
		if (!canDrag()) {
			abort()
			return
		}

		const pose = phonePose(drag, drag.stride, drag.gap)
		const pixelRatio = window.devicePixelRatio || 1
		const portalPose = phonePortalPose(pose, drag.portalEdges)
		const side = updateEdgeInteraction(pose, portalPose)
		pose.left += pixelOffset(pose.left, pixelRatio)
		pose.top += pixelOffset(pose.top, pixelRatio)
		if (side === 'rot') {
			floatingPiece.style.transform = `translate3d(${drag.portalEdges.right}px, ${pose.top}px, 0) translateX(-100%)`
		} else {
			const left = side === 'flip' ? drag.portalEdges.left : portalPose.left
			const snappedLeft = left + pixelOffset(left, pixelRatio)
			floatingPiece.style.transform = `translate3d(${snappedLeft}px, ${pose.top}px, 0)`
		}

		if (!side) updatePlacementPreview(pose)
	}

	function startDrag() {
		if (!pending || !canDrag()) {
			cancelPickup()
			return
		}

		const pickup = pending
		const { closeOverlays, metrics, color } = getConfig()
		cancelPickup()
		clearReturn()
		closeOverlays()

		const rect = readBoardRect(root)
		drag = {
			...pickup,
			piece: { ...pickup.piece },
			turns: [],
			rect,
			portalEdges: {
				left: flipPortal.getBoundingClientRect().right,
				right: rotatePortal.getBoundingClientRect().left,
			},
			home: pickup.element.querySelector('.shape').getBoundingClientRect(),
			stride: metrics.cell + metrics.gap,
			cell: metrics.cell,
			gap: metrics.gap,
			traySize: metrics.tray,
			moved: pickup.x !== pickup.sx || pickup.y !== pickup.sy,
			armed: true,
		}

		pickup.element.setPointerCapture(pickup.pointerId)
		showDragVisuals(root, portals, floatingPiece, ghost, drag, color)
		navigator.vibrate?.(12)
		scheduleFrame()
	}

	function beginPickup(event) {
		const element = event.target.closest('.pc')
		if (!element || !canDrag() || pending || drag || event.button !== 0) return

		const piece = getConfig().pieces.find(candidate => candidate.name === element.dataset.piece)
		if (!piece || piece.placed) return

		element.classList.add('touch')
		const { pointerId, clientX, clientY } = event
		pending = {
			element,
			piece,
			pointerId,
			sx: clientX,
			sy: clientY,
			x: clientX,
			y: clientY,
			timer: setTimeout(startDrag, PICKUP_DELAY_MS),
		}
	}

	function movePendingPickup(event) {
		pending.x = event.clientX
		pending.y = event.clientY
		const dx = pending.x - pending.sx
		const dy = pending.y - pending.sy

		if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) cancelPickup()
		else if (dy < -6) startDrag()
		else if (Math.hypot(dx, dy) > 6) cancelPickup()
	}

	function onPointerMove(event) {
		if (pending?.pointerId === event.pointerId) {
			movePendingPickup(event)
			return
		}
		if (drag?.pointerId !== event.pointerId) return

		drag.x = event.clientX
		drag.y = event.clientY
		if (Math.hypot(drag.x - drag.sx, drag.y - drag.sy) > 8) drag.moved = true
		scheduleFrame()
	}

	function onPointerUp(event) {
		if (pending?.pointerId === event.pointerId) cancelPickup()
		if (drag?.pointerId !== event.pointerId) return

		// Resolve the last queued pointer position before placing the piece.
		stopFrame()
		updateDrag()
		finishDrag({ attemptPlacement: true })
	}

	function onPointerCancel(event) {
		// Transferring implicit capture from a tile to the tray button fires this on the tile.
		if (event.type === 'lostpointercapture' && event.target !== drag?.element) return
		if (pending?.pointerId === event.pointerId) cancelPickup()
		if (drag?.pointerId === event.pointerId) finishDrag()
	}

	function onTouchMove(event) {
		if (drag && event.cancelable) event.preventDefault()
	}

	function onKeyDown(event) {
		if (event.key === 'Escape') finishDrag()
	}

	const listeners = [
		[tray, 'pointerdown', beginPickup],
		[tray, 'scroll', cancelPickup],
		[window, 'pointermove', onPointerMove],
		[window, 'pointerup', onPointerUp],
		[window, 'pointercancel', onPointerCancel],
		[tray, 'lostpointercapture', onPointerCancel],
		[window, 'resize', abort],
		[window, 'blur', abort],
		[document, 'keydown', onKeyDown],
		[document, 'touchmove', onTouchMove, { passive: false }],
	]
	for (const [target, type, handler, options] of listeners) {
		target.addEventListener(type, handler, options)
	}

	function destroy() {
		abort()
		clearReturn()
		for (const [target, type, handler, options] of listeners) {
			target.removeEventListener(type, handler, options)
		}
	}

	return { abort, destroy }
}
