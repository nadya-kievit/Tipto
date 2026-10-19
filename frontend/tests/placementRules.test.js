import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
	canPlacePieceInAnyOrientation,
	canPlacePieceInOrientation,
	closestLegalPlacement,
	isValidPlacement,
} from '../src/game/placementRules.js'

function makeBoard(width = 12, height = 12) {
	return Array.from({ length: height }, () => Array.from({ length: width }, () => ({
		playable: true, occupied: false, player: null,
	})))
}

const ownPlayer = { id: 'p1', pieces: [], startPosition: { row: 3, col: 3 } }
const abilities = [undefined, 'scout', 'connector']
const cases = [
	['isolated', 0, 0, ['scout']],
	['own edge', 3, 4, ['connector']],
	['own corner', 4, 4, abilities],
	['opponent edge', 3, 7, ['scout']],
	['opponent corner', 4, 7, ['scout']],
	['own occupied square', 3, 3, []],
	['opponent occupied square', 3, 8, []],
	['non-playable square', 5, 5, []],
	['outside height', 12, 0, []],
	['negative column', 0, -1, []],
]

for (const ability of abilities) {
	for (const [description, row, col, allowed] of cases) {
		test(`${ability || 'normal'} preview: ${description}`, () => {
			const board = makeBoard()
			board[3][3] = { playable: true, occupied: true, player: 'p1' }
			board[3][8] = { playable: true, occupied: true, player: 'p2' }
			board[5][5].playable = false
			assert.equal(isValidPlacement(board, [{ row, col }], ownPlayer, false, [], ability), allowed.includes(ability))
		})
	}
}

test('Connector previews permit touching multiple pieces', () => {
	const board = makeBoard()
	board[3][3] = { occupied: true, player: 'p1', playable: true }
	board[3][5] = { occupied: true, player: 'p1', playable: true }
	assert.equal(isValidPlacement(board, [{ row: 3, col: 4 }], ownPlayer, false, [], 'connector'), true)
})

test('piece remains playable when only another orientation has a placement', () => {
	const board = makeBoard(1, 2)
	const player = { id: 'p1', pieces: [], startPosition: { row: 0, col: 0 } }
	const piece = { name: 'domino', cells: [[0, 0], [0, 1]], rotation: 0, flipped: false }
	const players = [player]

	assert.equal(canPlacePieceInOrientation(board, piece, 0, false, player, 0, true, players), false)
	assert.equal(canPlacePieceInOrientation(board, piece, 90, false, player, 0, true, players), true)
	assert.equal(canPlacePieceInAnyOrientation(board, piece, player, 0, true, players), true)
})

test('closest placement follows the pointer using occupied cells rather than a piece bounding box', () => {
	const board = makeBoard(6, 6)
	const player = { id: 'p1', pieces: [{ placed: true }], startPosition: { row: 0, col: 0 } }
	const piece = { name: 'corner', cells: [[0, 0], [1, 0], [2, 0], [2, 1]], rotation: 0, flipped: false, ability: 'scout' }
	const cells = closestLegalPlacement(board, piece, player, 0, false, [player], 2.4, 3.4)

	assert.ok(cells.some(cell => cell.row === 2 && cell.col === 3))
})

test('closest placement updates over a non-playable board hole', () => {
	const board = makeBoard(5, 5)
	board[2][2].playable = false
	const player = { id: 'p1', pieces: [{ placed: true }], startPosition: { row: 0, col: 0 } }
	const piece = { name: 'single', cells: [[0, 0]], rotation: 0, flipped: false, ability: 'scout' }
	const cells = closestLegalPlacement(board, piece, player, 0, false, [player], 2.4, 2.8)

	assert.deepEqual(cells, [{ row: 2, col: 3 }])
})

const layouts = JSON.parse(readFileSync(new URL('../../backend/app/game/board_layouts_15.json', import.meta.url), 'utf8'))
for (const config of layouts.boards) {
	for (const ability of ['scout', 'connector']) {
		test(`${config.id}: ${ability} previews respect starts and reservations`, () => {
			const board = makeBoard(config.width, config.height)
			const playable = new Set(config.cells.map(([x, y]) => `${y},${x}`))
			board.forEach((row, y) => row.forEach((cell, x) => { cell.playable = playable.has(`${y},${x}`) }))
			const [first, second] = config.startPositions.map(([x, y]) => ({ row: y, col: x }))
			const player = { id: 'p1', startPosition: first, pieces: [] }
			const opponent = { id: 'p2', startPosition: second, pieces: [{ placed: false }] }
			const players = [player, opponent]
			assert.equal(isValidPlacement(board, [first], player, true, players, ability), true)
			assert.equal(isValidPlacement(board, [second], player, true, players, ability), false)
			assert.equal(isValidPlacement(board, [second], player, false, players, ability), false)
			const wrongStart = config.cells.map(([x, y]) => ({ row: y, col: x }))
				.find(cell => (cell.row !== first.row || cell.col !== first.col) && (cell.row !== second.row || cell.col !== second.col))
			assert.equal(isValidPlacement(board, [wrongStart], player, true, players, ability), false)
			opponent.pieces[0].placed = true
			if (ability === 'scout') assert.equal(isValidPlacement(board, [second], player, false, players, ability), true)
		})
	}
}
