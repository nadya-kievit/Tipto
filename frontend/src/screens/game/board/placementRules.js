import { displayCells } from '../piece/piecePresentation.js'

const EDGE_NEIGHBORS = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const CORNER_NEIGHBORS = [[-1, -1], [-1, 1], [1, -1], [1, 1]]

function touchesOwnPiece(board, cells, playerId, directions) {
	return cells.some(({ row, col }) => directions.some(([dr, dc]) =>
		board[row + dr]?.[col + dc]?.player === playerId))
}

function reservedStartingSquares(players, playerId) {
	return new Set(players
		.filter(other => other.id !== playerId && other.startPosition && !other.pieces.some(piece => piece.placed))
		.map(other => `${other.startPosition.row},${other.startPosition.col}`))
}

export function isValidPlacement(board, cells, player, isFirstMove, players, ability) {
	return validatePlacement(board, cells, player, isFirstMove, reservedStartingSquares(players, player.id), ability)
}

function validatePlacement(board, cells, player, isFirstMove, reservedStarts, ability) {
	const boardHeight = board.length
	const boardWidth = board[0]?.length || 0
	if (!cells.length || cells.some(cell =>
		cell.row < 0 || cell.row >= boardHeight ||
		cell.col < 0 || cell.col >= boardWidth ||
		board[cell.row][cell.col].playable === false ||
		board[cell.row][cell.col].occupied
	)) return false

	if (cells.some(cell => reservedStarts.has(`${cell.row},${cell.col}`))) return false

	if (isFirstMove) {
		const startPosition = player.startPosition || player.corner
		return cells.some(cell =>
			cell.row === startPosition?.row && cell.col === startPosition?.col
		)
	}

	const touchesEdge = touchesOwnPiece(board, cells, player.id, EDGE_NEIGHBORS)
	if (touchesEdge && ability !== 'connector') return false
	if (ability === 'scout') return true
	return (ability === 'connector' && touchesEdge) || touchesOwnPiece(board, cells, player.id, CORNER_NEIGHBORS)
}


function distanceToCell(pointerRow, pointerCol, row, col) {
	const nearestRow = Math.max(row, Math.min(pointerRow, row + 1))
	const nearestCol = Math.max(col, Math.min(pointerCol, col + 1))
	return (pointerRow - nearestRow) ** 2 + (pointerCol - nearestCol) ** 2
}


// Row/column order preserves distance ties. Availability searches can stop at the first result.
function* legalPlacements(board, piece, player, isFirstMove, reservedStarts) {
	const boardHeight = board.length
	const boardWidth = board[0]?.length || 0
	const normalizedCells = displayCells(piece.cells, piece.rotation, piece.flipped)
	const pieceRows = Math.max(...normalizedCells.map(cell => cell[0])) + 1
	const pieceCols = Math.max(...normalizedCells.map(cell => cell[1])) + 1

	for (let anchorRow = 0; anchorRow <= boardHeight - pieceRows; anchorRow += 1) {
		for (let anchorCol = 0; anchorCol <= boardWidth - pieceCols; anchorCol += 1) {
			const cells = normalizedCells.map(([row, col]) => ({ row: anchorRow + row, col: anchorCol + col }))

			if (validatePlacement(board, cells, player, isFirstMove, reservedStarts, piece.ability)) {
				yield cells
			}
		}
	}

}


export function closestLegalPlacement(board, piece, player, isFirstMove, players, pointerRow, pointerCol) {
	if (!board.length || !piece || !player) return []

	const reservedStarts = reservedStartingSquares(players, player.id)
	let nearestCells = []
	let nearestCellDistance = Infinity
	let nearestCentreDistance = Infinity

	for (const cells of legalPlacements(board, piece, player, isFirstMove, reservedStarts)) {
		const cellDistance = Math.min(...cells.map(cell => distanceToCell(pointerRow, pointerCol, cell.row, cell.col)))
		const centreRow = cells.reduce((total, cell) => total + cell.row + 0.5, 0) / cells.length
		const centreCol = cells.reduce((total, cell) => total + cell.col + 0.5, 0) / cells.length
		const centreDistance = (centreRow - pointerRow) ** 2 + (centreCol - pointerCol) ** 2

		if (cellDistance < nearestCellDistance ||
			(cellDistance === nearestCellDistance && centreDistance < nearestCentreDistance)) {
			nearestCellDistance = cellDistance
			nearestCentreDistance = centreDistance
			nearestCells = cells
		}
	}

	return nearestCells
}


export function canPlacePieceInOrientation(board, piece, rotation, flipped, player, isFirstMove, players) {
	const reservedStarts = reservedStartingSquares(players, player.id)
	const orientedPiece = { ...piece, rotation, flipped }
	return !legalPlacements(board, orientedPiece, player, isFirstMove, reservedStarts).next().done
}


export function canPlacePieceInAnyOrientation(board, piece, player, isFirstMove, players) {
	const reservedStarts = reservedStartingSquares(players, player.id)
	for (const flipped of [false, true]) {
		for (const rotation of [0, 90, 180, 270]) {
			const orientedPiece = { ...piece, rotation, flipped }
			if (!legalPlacements(board, orientedPiece, player, isFirstMove, reservedStarts).next().done) return true
		}
	}

	return false
}
