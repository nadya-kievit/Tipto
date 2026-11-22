export function displayCells(cells, rotation = 0, flipped = false) {
	const transformed = cells.map(([row, col]) => {
		const flippedCol = flipped ? -col : col
		switch (rotation) {
			case 90: return [-flippedCol, row]
			case 180: return [-row, -flippedCol]
			case 270: return [flippedCol, -row]
			default: return [row, flippedCol]
		}
	})
	const minRow = Math.min(...transformed.map(([row]) => row))
	const minCol = Math.min(...transformed.map(([, col]) => col))
	return transformed.map(([row, col]) => [row - minRow, col - minCol])
}

// Existing positive rotation values turn counter-clockwise in screen coordinates.
export function wheelRotation(rotation, deltaY) {
	return (rotation + (deltaY > 0 ? 270 : 90)) % 360
}

export function horizontalFlip(rotation, flipped) {
	return { rotation: (360 - rotation) % 360, flipped: !flipped }
}
