import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
	canPlacePieceInAnyOrientation,
	canPlacePieceInOrientation,
	closestLegalPlacement,
	isValidPlacement,
} from '../src/screens/game/board/placementRules.js'

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

	assert.equal(canPlacePieceInOrientation(board, piece, 0, false, player, true, players), false)
	assert.equal(canPlacePieceInOrientation(board, piece, 90, false, player, true, players), true)
	assert.equal(canPlacePieceInAnyOrientation(board, piece, player, true, players), true)
})

test('closest placement follows the pointer using occupied cells rather than a piece bounding box', () => {
	const board = makeBoard(6, 6)
	const player = { id: 'p1', pieces: [{ placed: true }], startPosition: { row: 0, col: 0 } }
	const piece = { name: 'corner', cells: [[0, 0], [1, 0], [2, 0], [2, 1]], rotation: 0, flipped: false, ability: 'scout' }
	const cells = closestLegalPlacement(board, piece, player, false, [player], 2.4, 3.4)

	assert.ok(cells.some(cell => cell.row === 2 && cell.col === 3))
})

test('closest placement updates over a non-playable board hole', () => {
	const board = makeBoard(5, 5)
	board[2][2].playable = false
	const player = { id: 'p1', pieces: [{ placed: true }], startPosition: { row: 0, col: 0 } }
	const piece = { name: 'single', cells: [[0, 0]], rotation: 0, flipped: false, ability: 'scout' }
	const cells = closestLegalPlacement(board, piece, player, false, [player], 2.4, 2.8)

	assert.deepEqual(cells, [{ row: 2, col: 3 }])
})

test('searches preserve every rotation and flip of an asymmetric piece', () => {
	const poses = [
		[0, false, [[0, 0], [1, 0], [1, 1]]],
		[90, false, [[1, 0], [1, 1], [0, 1]]],
		[180, false, [[1, 1], [0, 1], [0, 0]]],
		[270, false, [[0, 1], [0, 0], [1, 0]]],
		[0, true, [[0, 1], [1, 1], [1, 0]]],
		[90, true, [[0, 0], [0, 1], [1, 1]]],
		[180, true, [[1, 0], [0, 0], [0, 1]]],
		[270, true, [[1, 1], [1, 0], [0, 0]]],
	]
	for (const [rotation, flipped, offsets] of poses) {
		const board = makeBoard(7, 5)
		board.flat().forEach(cell => { cell.playable = false })
		const expected = offsets.map(([row, col]) => ({ row: row + 1, col: col + 2 }))
		expected.forEach(({ row, col }) => { board[row][col].playable = true })
		const piece = { cells: [[0, 0], [1, 0], [1, 1]], rotation, flipped, ability: 'scout' }
		assert.deepEqual(closestLegalPlacement(board, piece, ownPlayer, false, [], 1.5, 2.5), expected)
		assert.equal(canPlacePieceInOrientation(board, piece, rotation, flipped, ownPlayer, false, []), true)
		assert.equal(canPlacePieceInOrientation(board, piece, (rotation + 180) % 360, flipped, ownPlayer, false, []), false)
	}
})

test('searches preserve row and column coordinates on rectangular boards', () => {
	for (const [width, height] of [[7, 5], [5, 7]]) {
		const expected = [{ row: 1, col: 2 }, { row: 2, col: 2 }, { row: 2, col: 3 }]
		const board = makeBoard(width, height)
		board.flat().forEach(cell => { cell.playable = false })
		expected.forEach(({ row, col }) => { board[row][col].playable = true })
		const piece = { cells: [[0, 0], [1, 0], [1, 1]], rotation: 0, flipped: false, ability: 'scout' }
		assert.deepEqual(closestLegalPlacement(board, piece, ownPlayer, false, [], 1.5, 2.5), expected)
		assert.equal(canPlacePieceInOrientation(board, piece, 0, false, ownPlayer, false, []), true)
	}
})

test('equally close occupied cells prefer the nearest piece centre', () => {
	const piece = { cells: [[0, 0], [0, 1]], ability: 'scout' }
	assert.deepEqual(closestLegalPlacement(makeBoard(4, 1), piece, ownPlayer, false, [], 0.5, 1.9),
		[{ row: 0, col: 1 }, { row: 0, col: 2 }])
})

test('exact distance ties keep the first placement in row and column order', () => {
	const piece = { cells: [[0, 0]], ability: 'scout' }
	assert.deepEqual(closestLegalPlacement(makeBoard(2, 2), piece, ownPlayer, false, [], 1, 1),
		[{ row: 0, col: 0 }])
})

test('a later edge contact invalidates a normal or Scout piece despite an earlier corner contact', () => {
	const board = makeBoard(3, 3)
	board[0][0] = { occupied: true, player: ownPlayer.id }
	const cells = [{ row: 1, col: 1 }, { row: 1, col: 0 }]
	for (const ability of abilities) {
		assert.equal(isValidPlacement(board, cells, ownPlayer, false, [], ability), ability === 'connector')
	}
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
