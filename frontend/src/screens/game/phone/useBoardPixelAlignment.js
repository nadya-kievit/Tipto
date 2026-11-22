import { useLayoutEffect } from 'react'
import { pixelOffset } from '../boardGeometry'

// Keep centering from placing an otherwise pixel-aligned grid between pixels.
export default function useBoardPixelAlignment(surfaceRef) {
	useLayoutEffect(() => {
		const surface = surfaceRef.current
		if (!surface) return
		const align = () => {
			surface.style.translate = 'none'
			const rect = surface.getBoundingClientRect()
			const ratio = window.devicePixelRatio || 1
			surface.style.translate = `${pixelOffset(rect.left, ratio)}px ${pixelOffset(rect.top, ratio)}px`
		}
		align()
		const observer = new ResizeObserver(align)
		observer.observe(surface)
		observer.observe(surface.parentElement)
		window.addEventListener('resize', align)
		return () => {
			observer.disconnect()
			window.removeEventListener('resize', align)
		}
	})
}
