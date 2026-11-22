import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fitBoardCell, fitBoardGeometry, boardSpacing, pixelOffset, boardPointerCoordinate, readBoardPointer } from '../src/game/boardGeometry.js'

const css = readFileSync(new URL('../src/styles/game/board.css', import.meta.url), 'utf8')
const ratios = Object.fromEntries(['gap', 'pad', 'frame'].map(name =>
	[name, Number(css.match(new RegExp(`--board-${name}-ratio:\\s*([\\d.]+)`))[1])]))

test('pointer coordinates respect cells, gaps, fractional sizes and board edges', () => {
	assert.equal(boardPointerCoordinate(-5, 4, 8, 2), 0)
	assert.equal(boardPointerCoordinate(4, 4, 8, 2), 0.5)
	assert.equal(boardPointerCoordinate(9, 4, 8, 2), 1)
	assert.equal(boardPointerCoordinate(14, 4, 8, 2), 1.5)
	assert.equal(boardPointerCoordinate(100, 4, 8, 2), 4)
	assert.equal(boardPointerCoordinate(17.5, 4, 10.5, 1.75), 1.5)
})

test('pointer measurements subtract board offsets and padding', t => {
	const previousStyle = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle')
	globalThis.getComputedStyle = () => ({ columnGap: '2px', paddingLeft: '3px', paddingTop: '5px' })
	t.after(() => {
		if (previousStyle) Object.defineProperty(globalThis, 'getComputedStyle', previousStyle)
		else delete globalThis.getComputedStyle
	})
	const element = {
		getBoundingClientRect: () => ({ left: 100, top: 200, width: 40 }),
		querySelector: () => ({ getBoundingClientRect: () => ({ width: 8 }) }),
	}
	assert.deepEqual(readBoardPointer(element, 117, 209, 3, 4), { row: 0.5, col: 1.5 })
})

test('boards fit with equal device-pixel tiles and gaps at different display densities', () => {
	for (const spacing of [ratios, { gap: 0.15, pad: 0.75, frame: 0.05 }]) {
	 for (const pixelRatio of [1, 1.25, 1.5, 2, 2.625, 3]) {
		for (const [width, height] of [[351, 316], [366, 480], [1000, 800]]) {
			for (const [rows, cols] of [[12, 12], [16, 17], [17, 16], [25, 25]]) {
				const fit = fitBoardGeometry(width, height, rows, cols, spacing, pixelRatio)
				assert.ok(fit.cell > 0)
				assert.ok(fit.width <= width + 1e-9)
				assert.ok(fit.height <= height + 1e-9)
				for (const value of [fit.cell, fit.gap, fit.pad, fit.frame]) {
					assert.ok(Math.abs(value * pixelRatio - Math.round(value * pixelRatio)) < 1e-9)
				}
				// The next device-pixel tile size, with its own gap, must overflow.
				const nextCell = fit.cell + 1 / pixelRatio
				const next = boardSpacing(nextCell, spacing, pixelRatio)
				const extent = count => count * nextCell + (count - 1) * next.gap + 2 * (next.pad + next.frame)
				assert.ok(extent(cols) > width || extent(rows) > height)
				// Every column starts on the same device-pixel grid after centering.
				const origin = 12.137 + (width - fit.width) / 2
				const aligned = origin + pixelOffset(origin, pixelRatio) + fit.pad + fit.frame
				for (let col = 0; col < cols; col++) {
					const position = (aligned + col * (fit.cell + fit.gap)) * pixelRatio
					assert.ok(Math.abs(position - Math.round(position)) < 1e-9)
				}
			}
		}
	 }
	}
})

test('empty slots and invalid board dimensions do not produce a cell size', () => {
	for (const dimensions of [[0, 100, 12, 12], [100, 0, 12, 12], [100, 100, 0, 12], [100, 100, 12, -1], [1, 1, 12, 12]]) {
		assert.equal(fitBoardCell(...dimensions, ratios), null)
	}
})
