const COLOURS = ['#8B5CF6', '#F97316', '#EF4444', '#3B82F6', '#14B8A6', '#EAB308', '#EC4899', '#22C55E']

export function orientShape(shape, turns, flipped) {
	let rows = shape.map(row => [...row])
	if (flipped) rows = rows.map(row => row.reverse())
	for (let turn = 0; turn < turns; turn++) {
		rows = Array.from({ length: rows[0].length }, (_, column) =>
			rows.map(row => row[column]).reverse())
	}
	return rows.map(row => row.join(''))
}

// A stable seed keeps colours and orientations unchanged through page navigation.
export function createBackgroundVariants(pieces, copies, seed) {
	let state = seed >>> 0
	const random = () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0
		return state / 4294967296
	}
	const usedColours = new Map()
	return Array.from({ length: copies }, (_, copy) => pieces.map(piece => {
		const key = piece.name || piece.shape.join('/')
		const used = usedColours.get(key) || new Set()
		const options = COLOURS.filter(colour => !used.has(colour))
		const colour = copy === 0 ? piece.color : options[Math.floor(random() * options.length)]
		used.add(colour)
		usedColours.set(key, used)
		return {
			...piece,
			...(copy > 0 ? { left: 3 + random() * 86, right: undefined, top: 3 + random() * 84 } : {}),
			color: colour,
			shape: orientShape(piece.shape, Math.floor(random() * 4), random() < 0.5),
		}
	})).flat()
}
