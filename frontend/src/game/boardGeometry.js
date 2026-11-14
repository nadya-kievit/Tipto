// Appearance ratios come from board.css; only the available-space calculation lives here.
export function fitBoardCell(width, height, rows, columns, { gap, pad, frame }) {
	if (width <= 0 || height <= 0 || rows <= 0 || columns <= 0) return null
	const extent = count => count + (count - 1) * gap + 2 * (pad + frame)
	// Round down at the browser's layout precision so the frame stays inside the slot.
	const cell = Math.floor(Math.min(width / extent(columns), height / extent(rows)) * 64) / 64
	return cell > 0 ? cell : null
}
