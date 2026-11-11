// The approved desktop finish at a 50px cell is the reference at every size.
// Board geometry and decoration scale together, independently of page UI scale.
export function boardMetricsForCell(cell) {
	const scale = cell / 50
	return {
		cell, gap: 3.75 * scale, pad: 25 * scale,
		radius: 2 * scale, bevel: 2 * scale,
		outline: 3 * scale, stripe: 2 * scale, repeat: 7 * scale,
		edge: 2 * scale, frame: scale,
	}
}

export function fitBoardMetrics(width, height, rows, columns) {
	if (width <= 0 || height <= 0 || rows <= 0 || columns <= 0) return null
	const extent = count => count + (count - 1) * 0.075 + 1 + 0.04
	// Round down once at the browser's layout precision, then derive every metric.
	const cell = Math.floor(Math.min(width / extent(columns), height / extent(rows)) * 64) / 64
	return cell > 0 ? boardMetricsForCell(cell) : null
}
