const REFERENCE_AREA = 30_000
const PIECES_PER_REFERENCE_AREA = 1.5
const MIN_PIECES = 8
const MAX_PIECES = 40

export function backgroundPieceCount(width, height, available) {
	if (available <= 0 || width <= 0 || height <= 0) return 0
	const target = Math.floor(width * height / REFERENCE_AREA * PIECES_PER_REFERENCE_AREA)
	return Math.min(available, Math.max(MIN_PIECES, Math.min(MAX_PIECES, target)))
}

export function backgroundPieceAnchor(piece, width, height, pieceWidth) {
	return {
		x: piece.left === undefined
			? width * (1 - (piece.right ?? 0) / 100) - pieceWidth
			: width * piece.left / 100,
		y: height * piece.top / 100,
	}
}

// Shuffle once per mounted background. Resizing then reveals a stable prefix,
// so pieces return in the same order instead of the whole scene changing.
export function orderBackgroundPieces(pieces, seed) {
	let state = (seed ^ 0x9e3779b9) >>> 0
	const random = () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0
		return state / 4294967296
	}
	const ordered = [...pieces]
	for (let index = ordered.length - 1; index > 0; index--) {
		const other = Math.floor(random() * (index + 1))
		;[ordered[index], ordered[other]] = [ordered[other], ordered[index]]
	}
	return ordered
}
