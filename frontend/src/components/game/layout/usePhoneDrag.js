import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPhoneDragController } from './phoneDragController'

export default function usePhoneDrag(rootRef, config, enabled = true) {
	const latest = useRef(config)
	const controllerRef = useRef(null)

	useLayoutEffect(() => {
		latest.current = config
	})

	useEffect(() => {
		if (!enabled) return

		const controller = createPhoneDragController(rootRef.current, () => latest.current)
		controllerRef.current = controller

		return () => {
			controller.destroy()
			controllerRef.current = null
		}
	}, [rootRef, enabled])

	const {
		canMove,
		board,
		metrics: { cell, gap, pixelRatio },
		game: { turnEndsAt, turnNumber, currentPlayerId },
	} = config

	useEffect(() => {
		if (!enabled) return

		controllerRef.current?.abort()
		if (!turnEndsAt) return

		const timeout = setTimeout(
			() => controllerRef.current?.abort(),
			Math.max(0, turnEndsAt - Date.now()),
		)
		return () => clearTimeout(timeout)
	}, [enabled, canMove, board, turnEndsAt, turnNumber, currentPlayerId, cell, gap, pixelRatio])
}
