import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fitBoardCell } from '../src/game/boardGeometry.js'
import { tileFinish } from '../src/game/piecePresentation.js'

const css = readFileSync(new URL('../src/styles/game/board.css', import.meta.url), 'utf8')
const ratios = Object.fromEntries(['gap', 'pad', 'frame'].map(name =>
	[name, Number(css.match(new RegExp(`--board-${name}-ratio:\\s*([\\d.]+)`))[1])]))

test('boards of every shape fit the available slot using stylesheet spacing', () => {
	for (const spacing of [ratios, { gap: 0.15, pad: 0.75, frame: 0.05 }]) {
		for (const [width, height] of [[351, 316], [366, 480], [1000, 800], [1, 1]]) {
			for (const [rows, cols] of [[12, 12], [16, 17], [17, 16], [25, 25]]) {
				const cell = fitBoardCell(width, height, rows, cols, spacing)
				assert.ok(cell > 0)
				const extent = count => cell * (count + (count - 1) * spacing.gap + 2 * (spacing.pad + spacing.frame))
				assert.ok(extent(cols) <= width)
				assert.ok(extent(rows) <= height)
				// The next layout increment must exceed at least one available dimension.
				const nextScale = (cell + 1 / 64) / cell
				assert.ok(extent(cols) * nextScale > width || extent(rows) * nextScale > height)
			}
		}
	}
})

test('empty slots and invalid board dimensions do not produce a cell size', () => {
	for (const dimensions of [[0, 100, 12, 12], [100, 0, 12, 12], [100, 100, 0, 12], [100, 100, 12, -1]]) {
		assert.equal(fitBoardCell(...dimensions, ratios), null)
	}
})

test('compact tray and list finishes retain their existing sizes', () => {
	assert.match(tileFinish('#8e44ad', null, 'tray').boxShadow, /inset 0 2px/)
	assert.match(tileFinish('#8e44ad', 'scout', 'tray').boxShadow, /0 2px/)
	assert.match(tileFinish('#8e44ad', 'connector', 'tray').background, /0 1px, transparent 1px 5px/)
	assert.match(tileFinish('#8e44ad', 'scout', 'list').boxShadow, /0 1px/)
})
