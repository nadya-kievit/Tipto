const FINISH_SIZES = {
	board: { outline: 3, stripe: 2, repeat: 7 },
	tray: { outline: 2, stripe: 1, repeat: 5 },
	list: { outline: 1, stripe: 1, repeat: 3 },
}

export function tileFinish(color, ability, context = 'board', isLastMove = false) {
	const size = FINISH_SIZES[context] || FINISH_SIZES.board
	let background = color
	let boxShadow = 'inset 0 2px 0 rgba(255,255,255,0.22), inset 0 -2px 0 rgba(0,0,0,0.2)'
	if (ability === 'scout') {
		background = `color-mix(in srgb, ${color} 16%, var(--cell))`
		boxShadow = `inset 0 0 0 ${size.outline}px ${color}`
	} else if (ability === 'connector') {
		background = `repeating-linear-gradient(135deg, var(--stripe) 0 ${size.stripe}px, transparent ${size.stripe}px ${size.repeat}px), ${color}`
		boxShadow = 'none'
	}
	if (isLastMove) {
		boxShadow = `${boxShadow === 'none' ? '' : `${boxShadow}, `}inset 0 0 0 2px var(--tile-outline)`
	}
	return { background, boxShadow }
}

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
