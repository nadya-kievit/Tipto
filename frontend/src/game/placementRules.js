export function isValidPlacement(board, cells, player, isFirstMove, players, ability) {
	const boardHeight = board.length
	const boardWidth = board[0]?.length || 0
	if (!cells.length || cells.some(cell =>
		cell.row < 0 || cell.row >= boardHeight ||
		cell.col < 0 || cell.col >= boardWidth ||
		board[cell.row][cell.col].playable === false ||
		board[cell.row][cell.col].occupied
	)) return false

	const reservedStarts = new Set(
		players
			.filter(otherPlayer =>
				otherPlayer.id !== player.id &&
				otherPlayer.startPosition &&
				!otherPlayer.pieces.some(piece => piece.placed)
			)
			.map(otherPlayer =>
				`${otherPlayer.startPosition.row},${otherPlayer.startPosition.col}`
			)
	)
	if (cells.some(cell => reservedStarts.has(`${cell.row},${cell.col}`))) return false

	if (isFirstMove) {
		const startPosition = player.startPosition || player.corner
		return cells.some(cell =>
			cell.row === startPosition?.row && cell.col === startPosition?.col
		)
	}

	let touchesOwnPieceDiagonally = false
	let touchesOwnPieceAlongEdge = false

	for (const cell of cells) {
		const sideNeighbors = [
			[cell.row - 1, cell.col],
			[cell.row + 1, cell.col],
			[cell.row, cell.col - 1],
			[cell.row, cell.col + 1],
		]

		if (sideNeighbors.some(([row, col]) =>
			row >= 0 && row < boardHeight &&
			col >= 0 && col < boardWidth &&
			board[row][col].player === player.id
		)) {
			touchesOwnPieceAlongEdge = true
			if (ability !== 'connector') return false
		}

		const diagonalNeighbors = [
			[cell.row - 1, cell.col - 1],
			[cell.row - 1, cell.col + 1],
			[cell.row + 1, cell.col - 1],
			[cell.row + 1, cell.col + 1],
		]

		if (diagonalNeighbors.some(([row, col]) =>
			row >= 0 && row < boardHeight &&
			col >= 0 && col < boardWidth &&
			board[row][col].player === player.id
		)) touchesOwnPieceDiagonally = true
	}

	if (ability === 'scout') return true
	if (ability === 'connector') return touchesOwnPieceAlongEdge || touchesOwnPieceDiagonally
	return touchesOwnPieceDiagonally
}


export function rotationForCells(cells, rotation, flipped = false) {
	return cells.map(([row, col]) => {
		const transformedCol = flipped ? -col : col

		switch (rotation) {
			case 90: return [-transformedCol, row]
			case 180: return [-row, -transformedCol]
			case 270: return [transformedCol, -row]
			default: return [row, transformedCol]
		}
	})
}


export function viewToBoard(row, col, rotation, height, width) {
	switch (rotation) {
		case 90: return { row: height - 1 - col, col: row }
		case 180: return { row: height - 1 - row, col: width - 1 - col }
		case 270: return { row: col, col: width - 1 - row }
		default: return { row, col }
	}
}


function distanceToCell(pointerRow, pointerCol, row, col) {
	const nearestRow = Math.max(row, Math.min(pointerRow, row + 1))
	const nearestCol = Math.max(col, Math.min(pointerCol, col + 1))
	return (pointerRow - nearestRow) ** 2 + (pointerCol - nearestCol) ** 2
}


export function closestLegalPlacement(
	board,
	piece,
	player,
	boardRotation,
	isFirstMove,
	players,
	pointerRow,
	pointerCol,
) {
	if (!board.length || !piece || !player) return []

	const boardHeight = board.length
	const boardWidth = board[0]?.length || 0
	const viewHeight = boardRotation % 180 === 0 ? boardHeight : boardWidth
	const viewWidth = boardRotation % 180 === 0 ? boardWidth : boardHeight
	const rotatedCells = rotationForCells(piece.cells, piece.rotation, piece.flipped)
	const minRow = Math.min(...rotatedCells.map(cell => cell[0]))
	const minCol = Math.min(...rotatedCells.map(cell => cell[1]))
	const normalizedCells = rotatedCells.map(([row, col]) => [row - minRow, col - minCol])
	const pieceRows = Math.max(...normalizedCells.map(cell => cell[0])) + 1
	const pieceCols = Math.max(...normalizedCells.map(cell => cell[1])) + 1
	let nearestCells = []
	let nearestCellDistance = Infinity
	let nearestCentreDistance = Infinity

	for (let anchorRow = 0; anchorRow <= viewHeight - pieceRows; anchorRow += 1) {
		for (let anchorCol = 0; anchorCol <= viewWidth - pieceCols; anchorCol += 1) {
			const viewCells = normalizedCells.map(([row, col]) => ({ row: anchorRow + row, col: anchorCol + col }))
			const cells = viewCells.map(cell => viewToBoard(
				cell.row,
				cell.col,
				boardRotation,
				boardHeight,
				boardWidth,
			))

			if (!isValidPlacement(board, cells, player, isFirstMove, players, piece.ability)) continue

			const cellDistance = Math.min(...viewCells.map(cell =>
				distanceToCell(pointerRow, pointerCol, cell.row, cell.col)))
			const centreRow = viewCells.reduce((total, cell) => total + cell.row + 0.5, 0) / viewCells.length
			const centreCol = viewCells.reduce((total, cell) => total + cell.col + 0.5, 0) / viewCells.length
			const centreDistance = (centreRow - pointerRow) ** 2 + (centreCol - pointerCol) ** 2

			if (cellDistance < nearestCellDistance ||
				(cellDistance === nearestCellDistance && centreDistance < nearestCentreDistance)) {
				nearestCellDistance = cellDistance
				nearestCentreDistance = centreDistance
				nearestCells = cells
			}
		}
	}

	return nearestCells
}


export function canPlacePieceInOrientation(
	board,
	piece,
	rotation,
	flipped,
	player,
	boardRotation,
	isFirstMove,
	players,
) {
	const boardHeight = board.length
	const boardWidth = board[0]?.length || 0
	const viewHeight = boardRotation % 180 === 0 ? boardHeight : boardWidth
	const viewWidth = boardRotation % 180 === 0 ? boardWidth : boardHeight
	const rotatedCells = rotationForCells(piece.cells, rotation, flipped)
	const minRow = Math.min(...rotatedCells.map(cell => cell[0]))
	const minCol = Math.min(...rotatedCells.map(cell => cell[1]))
	const pieceRows = Math.max(...rotatedCells.map(cell => cell[0])) - minRow + 1
	const pieceCols = Math.max(...rotatedCells.map(cell => cell[1])) - minCol + 1

	for (let anchorRow = 0; anchorRow <= viewHeight - pieceRows; anchorRow += 1) {
		for (let anchorCol = 0; anchorCol <= viewWidth - pieceCols; anchorCol += 1) {
			const cells = rotatedCells.map(cell => viewToBoard(
				anchorRow + cell[0] - minRow,
				anchorCol + cell[1] - minCol,
				boardRotation,
				boardHeight,
				boardWidth,
			))

			if (isValidPlacement(board, cells, player, isFirstMove, players, piece.ability)) {
				return true
			}
		}
	}

	return false
}


export function canPlacePieceInAnyOrientation(
	board,
	piece,
	player,
	boardRotation,
	isFirstMove,
	players,
) {
	for (const flipped of [false, true]) {
		for (const rotation of [0, 90, 180, 270]) {
			if (canPlacePieceInOrientation(
				board,
				piece,
				rotation,
				flipped,
				player,
				boardRotation,
				isFirstMove,
				players,
			)) return true
		}
	}

	return false
}
