const L_SHAPES = [
	[[0, 0], [1, 0], [1, 1]],
	[[0, 0], [0, 1], [1, 0]],
	[[0, 0], [0, 1], [1, 1]],
	[[0, 1], [1, 0], [1, 1]],
]

const placementCache = new WeakMap()

// Layout and player count determine geometry; names and colours do not.
export function previewPlacements(board, playerCount) {
	let layouts = placementCache.get(board)
	if (!layouts) {
		layouts = new Map()
		placementCache.set(board, layouts)
	}
	if (layouts.has(playerCount)) return layouts.get(playerCount)

	const candidates = []
	for (const shape of L_SHAPES) {
		for (let row = 0; row < 7; row++) {
			for (let col = 0; col < 7; col++) {
				const cells = shape.map(([dr, dc]) => [row + dr, col + dc])
				if (cells.every(([r, c]) => r < 7 && c < 7 && board.shape[r][c] === '#')) {
					candidates.push(cells)
				}
			}
		}
	}

	const occupied = new Set()
	const occupiedCells = []
	const placements = []
	for (let player = 0; player < playerCount; player++) {
		let best = null
		for (const cells of candidates) {
			if (cells.some(([r, c]) => occupied.has(r * 7 + c))) continue
			let nearest = Infinity
			let total = 0
			for (const [r, c] of cells) {
				if (!occupiedCells.length) {
					total += (r - 3) ** 2 + (c - 3) ** 2
				} else {
					for (const [or, oc] of occupiedCells) {
						const distance = (r - or) ** 2 + (c - oc) ** 2
						nearest = Math.min(nearest, distance)
						total += distance
					}
				}
			}
			if (!occupiedCells.length) nearest = total
			if (!best || nearest > best.nearest || nearest === best.nearest && total > best.total) {
				best = { cells, nearest, total }
			}
		}
		const cells = best?.cells ?? []
		placements.push(cells)
		for (const [r, c] of cells) {
			occupied.add(r * 7 + c)
			occupiedCells.push([r, c])
		}
	}
	layouts.set(playerCount, placements)
	return placements
}
