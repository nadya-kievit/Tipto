import { displayCells } from '../piece/piecePresentation'

function createTile(tag, className, piece, color) {
	const tile = document.createElement(tag)
	tile.className = className
	tile.dataset.occupied = 'true'
	tile.dataset.ability = piece.ability || 'normal'
	tile.style.setProperty('--tile-color', color)
	return tile
}

export function drawFloatingPiece(floatingPiece, piece, size, color) {
	const cells = displayCells(piece.cells, piece.rotation, piece.flipped)
	const shape = document.createElement('span')
	shape.className = 'gameBoardPiece'
	shape.style.setProperty('--board-cell-size', `${size}px`)
	shape.style.setProperty('--board-columns', Math.max(...cells.map(([, col]) => col)) + 1)
	shape.style.setProperty('--board-rows', Math.max(...cells.map(([row]) => row)) + 1)

	for (const [row, col] of cells) {
		const tile = createTile('i', 'gameBoardTile', piece, color)
		tile.style.gridRow = row + 1
		tile.style.gridColumn = col + 1
		shape.append(tile)
	}
	floatingPiece.replaceChildren(shape)
	return shape
}

export function showDragVisuals(root, portals, floatingPiece, ghost, drag, color) {
	drag.element.classList.add('lifted')
	root.classList.add('dragging')

	const hint = root.querySelector('.dhText')
	const { ability } = drag.piece
	hint.textContent = 'Hold the piece against an edge'
	if (ability === 'scout') hint.textContent = 'Scout: no corner needed; no own edges.'
	if (ability === 'connector') hint.textContent = 'Connector: touch your edge or corner.'
	hint.classList.toggle('rule', Boolean(ability))

	for (const portal of portals) {
		if (portal.classList.contains('portal')) {
			const label = root.querySelector(`.dh[data-side="${portal.dataset.side}"]`).getBoundingClientRect()
			const top = label.top + label.height / 2
			portal.style.top = `${top}px`
			portal.style.height = `${Math.max(0, drag.rect.bottom - top)}px`
		}
		portal.classList.add('pulse')
	}

	ghost.replaceChildren(...drag.piece.cells.map(() => createTile('span', 'ghost gameBoardTile', drag.piece, color)))
	ghost.hidden = true
	drawFloatingPiece(floatingPiece, drag.piece, drag.cell, color)
	floatingPiece.hidden = false
}

export function clearDragVisuals(root, portals, ghost, element) {
	root.classList.remove('dragging')
	ghost.hidden = true
	for (const portal of portals) {
		portal.classList.remove('near', 'pulse')
		portal.style.setProperty('--prox', 0)
	}
	element.classList.remove('touch', 'home', 'lifted')
}

export function paintEdgeHighlights(portals, side, proximity) {
	for (const portal of portals) {
		const edge = portal.dataset.side
		portal.style.setProperty('--prox', proximity[edge].toFixed(2))
		portal.classList.toggle('near', side === edge)
	}
}

export function paintPlacementPreview(ghost, drag, bounds, target) {
	drag.element.classList.toggle('home', !target)
	ghost.hidden = !target
	if (!target) return

	target.cells.forEach(({ row, col }, index) => {
		const x = (col - bounds.col) * drag.stride
		const y = (row - bounds.row) * drag.stride
		ghost.children[index].style.transform = `translate(${x}px, ${y}px)`
	})
}
