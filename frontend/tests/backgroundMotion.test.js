import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceAxis, advancePieces, arrangePieces, pieceGeometry, piecesOverlap } from '../src/components/backgroundMotion.js'

function makePiece(shape, x, y) {
	return {
		x, y, width: shape[0].length * 29 - 1, height: shape.length * 29 - 1,
		vx: 60, vy: 0, active: true,
		cells: shape.flatMap((row, r) => [...row].flatMap((cell, c) =>
			cell === '#' ? [{ x: c * 29, y: r * 29, width: 28, height: 28 }] : [])),
	}
}

function assertSeparated(pieces, width, height) {
	const active = pieces.filter(piece => piece.active)
	for (let index = 0; index < active.length; index++) {
		const bounds = pieceGeometry(active[index])
		assert.ok(bounds.minX >= -1e-5 && bounds.maxX <= width + 1e-5)
		assert.ok(bounds.minY >= -1e-5 && bounds.maxY <= height + 1e-5)
		for (let other = index + 1; other < active.length; other++) {
			assert.equal(piecesOverlap(active[index], active[other]), false)
		}
	}
}

test('border reflection preserves overshoot', () => {
	assert.deepEqual(advanceAxis(98, 10, 0.5, 100), { position: 97, velocity: -10 })
	assert.deepEqual(advanceAxis(2, -10, 0.5, 100), { position: 3, velocity: 10 })
})

test('empty spaces in a shape do not cause collisions', () => {
	const frame = makePiece(['###', '#.#', '###'], 0, 0)
	const inside = makePiece(['#'], 29, 29)
	assert.equal(piecesOverlap(frame, inside), false)
	inside.x = 20
	assert.equal(piecesOverlap(frame, inside), true)
})

test('close pieces keep their velocity until actual tile contact', () => {
	const a = makePiece(['#####'], 20, 50)
	const b = makePiece(['#'], 200, 50)
	b.vx = -60
	advancePieces([a, b], 0.1, 500, 200)
	assert.equal(a.vx, 60)
	assert.equal(b.vx, -60)
	assert.ok(Math.abs(a.x - 26) < 1e-6)
	advancePieces([a, b], 0.3, 500, 200)
	assert.ok(a.vx < 0 && b.vx > 0)
	assertSeparated([a, b], 500, 200)
})

test('pieces bounce at visible screen edges and retain their fixed orientation', () => {
	const piece = makePiece(['#.', '##'], 1, 20)
	piece.vx = -60
	const cellsBefore = structuredClone(piece.cells)
	advancePieces([piece], 0.1, 300, 200)
	assert.ok(piece.vx > 0)
	assert.deepEqual(piece.cells, cellsBefore)
	assert.equal(piece.rotation, undefined)
	assertSeparated([piece], 300, 200)
})

test('64 moving shapes remain separated through collisions and resize', () => {
	const shapes = [['####', '...#'], ['.#.', '###', '.#.'], ['##', '#.', '##'], ['#####'], ['#'], ['##', '##']]
	const pieces = Array.from({ length: 64 }, (_, index) => {
		const piece = makePiece(shapes[index % shapes.length], index * 17, (index * 53) % 800)
		piece.vx = Math.cos(index) * 108
		piece.vy = Math.sin(index) * 108
		return piece
	})
	arrangePieces(pieces, 1440, 900)
	assert.equal(pieces.filter(piece => piece.active).length, 64)
	for (let frame = 0; frame < 200; frame++) {
		advancePieces(pieces, 0.1, 1440, 900)
		assertSeparated(pieces, 1440, 900)
	}
	arrangePieces(pieces, 360, 640)
	for (let frame = 0; frame < 30; frame++) {
		advancePieces(pieces, 0.1, 360, 640)
		assertSeparated(pieces, 360, 640)
	}
})

test('fast pieces cannot tunnel through occupied tiles', () => {
	const a = makePiece(['#'], 10, 20)
	const b = makePiece(['#'], 100, 20)
	a.vx = 1000
	b.vx = -1000
	advancePieces([a, b], 0.1, 300, 100)
	assertSeparated([a, b], 300, 100)
	assert.ok(a.x < b.x)
})
