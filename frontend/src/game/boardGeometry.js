// Appearance ratios come from board.css; only the available-space calculation lives here.
export function readBoardRatios(element) {
	const style = getComputedStyle(element)
	return Object.fromEntries(['gap', 'pad', 'frame'].map(name =>
		[name, Number.parseFloat(style.getPropertyValue(`--board-${name}-ratio`))]))
}

export function boardSpacing(cell, { gap, pad, frame }, pixelRatio = 1) {
	const snap = ratio => Math.round(cell * pixelRatio * ratio + 1e-9) / pixelRatio
	return { gap: gap > 0 ? Math.max(1 / pixelRatio, snap(gap)) : 0,
		pad: snap(pad), frame: snap(frame) }
}

export function fitBoardGeometry(width, height, rows, columns, ratios, pixelRatio = 1) {
	if (![width, height, rows, columns, pixelRatio].every(value => Number.isFinite(value) && value > 0)) return null
	const geometry = pixels => {
		const cell = pixels / pixelRatio
		const spacing = boardSpacing(cell, ratios, pixelRatio)
		const extent = count => count * cell + (count - 1) * spacing.gap + 2 * (spacing.pad + spacing.frame)
		return { cell, ...spacing, width: extent(columns), height: extent(rows), pixelRatio }
	}
	// Search whole device-pixel tile sizes, including each size's rounded spacing.
	let low = 1, high = Math.floor(Math.min(width / columns, height / rows) * pixelRatio)
	let best = null
	while (low <= high) {
		const middle = Math.floor((low + high) / 2)
		const next = geometry(middle)
		if (next.width <= width + 1e-9 && next.height <= height + 1e-9) {
			best = next
			low = middle + 1
		} else high = middle - 1
	}
	return best
}

export function fitBoardCell(width, height, rows, columns, ratios, pixelRatio = 1) {
	return fitBoardGeometry(width, height, rows, columns, ratios, pixelRatio)?.cell ?? null
}

export function boardGeometryStyle({ cell, gap, pad, frame }) {
	return { '--board-cell-size': `${cell}px`, '--board-gap-size': `${gap}px`,
		'--board-pad-size': `${pad}px`, '--board-frame-size': `${frame}px` }
}

export function pixelOffset(position, pixelRatio) {
	return Math.round(position * pixelRatio) / pixelRatio - position
}

// Browser zoom and moving between monitors can change DPR without a slot resize.
export function observeBoardPixelRatio(update) {
	let query
	const change = () => {
		query?.removeEventListener('change', change)
		query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
		query.addEventListener('change', change)
		update()
	}
	change()
	window.addEventListener('resize', update)
	return () => {
		query.removeEventListener('change', change)
		window.removeEventListener('resize', update)
	}
}
