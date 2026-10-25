import test from 'node:test'
import assert from 'node:assert/strict'
import {
	backgroundPieceAnchor, backgroundPieceCount, orderBackgroundPieces,
} from '../src/components/backgroundDensity.js'

test('piece count scales with viewport area and is capped', () => {
	assert.equal(backgroundPieceCount(390, 844, 64), 16)
	assert.equal(backgroundPieceCount(768, 1024, 64), 39)
	assert.equal(backgroundPieceCount(1440, 900, 64), 40)
	assert.equal(backgroundPieceCount(2560, 1440, 64), 40)
})

test('piece count respects minimum, availability, and invalid dimensions', () => {
	assert.equal(backgroundPieceCount(200, 300, 64), 8)
	assert.equal(backgroundPieceCount(200, 300, 5), 5)
	assert.equal(backgroundPieceCount(0, 844, 64), 0)
	assert.equal(backgroundPieceCount(390, 844, 0), 0)
})

test('piece anchors redistribute with the viewport aspect ratio', () => {
	const fromLeft = { left: 25, top: 75 }
	assert.deepEqual(backgroundPieceAnchor(fromLeft, 1200, 600, 80), { x: 300, y: 450 })
	assert.deepEqual(backgroundPieceAnchor(fromLeft, 600, 1200, 80), { x: 150, y: 900 })

	const fromRight = { right: 10, top: 20 }
	assert.deepEqual(backgroundPieceAnchor(fromRight, 1200, 600, 80), { x: 1000, y: 120 })
	assert.deepEqual(backgroundPieceAnchor(fromRight, 600, 1200, 80), { x: 460, y: 240 })
})

test('piece ordering is seeded and stable', () => {
	const pieces = Array.from({ length: 16 }, (_, id) => ({ id }))
	const first = orderBackgroundPieces(pieces, 42)
	const same = orderBackgroundPieces(pieces, 42)
	const different = orderBackgroundPieces(pieces, 43)

	assert.deepEqual(first, same)
	assert.notDeepEqual(first, different)
	assert.deepEqual(first.map(piece => piece.id).sort((a, b) => a - b), pieces.map(piece => piece.id))
	assert.notEqual(first, pieces)
})
