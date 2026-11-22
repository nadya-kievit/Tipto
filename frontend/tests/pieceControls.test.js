import assert from 'node:assert/strict'
import test from 'node:test'
import { displayCells, horizontalFlip, wheelRotation } from '../src/screens/game/piecePresentation.js'

const asymmetric = [[0, 0], [0, 1], [0, 2], [1, 2]]
const sorted = cells => cells.map(cell => cell.join(',')).sort()

test('wheel down rotates the visible piece clockwise, up reverses it', () => {
	const rotation = wheelRotation(0, 100)
	assert.deepEqual(sorted(displayCells(asymmetric, rotation)), sorted([[0, 1], [1, 1], [2, 1], [2, 0]]))
	assert.equal(wheelRotation(rotation, -100), 0)
})

test('four wheel rotations return to the original orientation', () => {
	for (const delta of [-100, 100]) {
		let rotation = 0
		for (let step = 0; step < 4; step++) rotation = wheelRotation(rotation, delta)
		assert.equal(rotation, 0)
	}
})

test('right-click mirrors the displayed piece horizontally at every rotation', () => {
	for (const rotation of [0, 90, 180, 270]) {
		for (const flipped of [false, true]) {
			const before = displayCells(asymmetric, rotation, flipped)
			const maxCol = Math.max(...before.map(([, col]) => col))
			const expected = before.map(([row, col]) => [row, maxCol - col])
			const next = horizontalFlip(rotation, flipped)
			assert.deepEqual(sorted(displayCells(asymmetric, next.rotation, next.flipped)), sorted(expected))
		}
	}
})

test('two horizontal flips restore the original held orientation', () => {
	for (const rotation of [0, 90, 180, 270]) {
		const once = horizontalFlip(rotation, false)
		assert.deepEqual(horizontalFlip(once.rotation, once.flipped), { rotation, flipped: false })
	}
})
