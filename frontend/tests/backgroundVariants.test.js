import test from 'node:test'
import assert from 'node:assert/strict'
import { createBackgroundVariants, orientShape } from '../src/components/backgroundVariants.js'

test('rotation and reflection preserve occupied tiles and update shape bounds', () => {
	const shape = ['####', '...#']
	assert.deepEqual(orientShape(shape, 1, false), ['.#', '.#', '.#', '##'])
	assert.deepEqual(orientShape(shape, 0, true), ['####', '#...'])
	assert.deepEqual(orientShape(shape, 4, false), shape)
	for (let turns = 0; turns < 4; turns++) {
		for (const flipped of [true, false]) {
			const oriented = orientShape(shape, turns, flipped)
			assert.equal([...oriented.join('')].filter(cell => cell === '#').length, 5)
		}
	}
})

test('doubling the set yields four copies per shape with distinct colours', () => {
	const shapes = Array.from({ length: 16 }, (_, index) => ({
		name: `shape-${index}`, left: index * 3, top: index * 4,
		color: '#8B5CF6', shape: ['.#.', '###', '.#.'],
	}))
	const originals = [...shapes, ...shapes.map(piece => ({ ...piece, color: '#F97316' }))]
	const result = createBackgroundVariants(originals, 2, 42)
	assert.equal(result.length, 64)
	for (const shape of shapes) {
		const copies = result.filter(piece => piece.name === shape.name)
		assert.equal(copies.length, 4)
		assert.equal(new Set(copies.map(piece => piece.color)).size, 4)
	}
	assert.deepEqual(createBackgroundVariants(originals, 2, 42), result)
	assert.notDeepEqual(createBackgroundVariants(originals, 2, 43), result)
	assert.ok(result.slice(32).every(piece => piece.left >= 3 && piece.left <= 89))
})
