import test from 'node:test'
import assert from 'node:assert/strict'
import { boardMetricsForCell, fitBoardMetrics } from '../src/game/boardPresentation.js'
import { tileFinish } from '../src/game/piecePresentation.js'

test('boards of every shape fit the available slot, including their frame', () => {
	for (const [width, height] of [[351, 316], [366, 480], [1000, 800], [1, 1]]) {
		for (const [rows, cols] of [[12, 12], [16, 17], [17, 16], [25, 25]]) {
			const m = fitBoardMetrics(width, height, rows, cols)
			assert.ok(m && m.cell > 0)
			assert.ok(cols * m.cell + (cols - 1) * m.gap + 2 * (m.pad + m.frame) <= width)
			assert.ok(rows * m.cell + (rows - 1) * m.gap + 2 * (m.pad + m.frame) <= height)
		}
	}
	assert.equal(fitBoardMetrics(0, 100, 12, 12), null)
})

test('phone and desktop decorations have the same proportions', () => {
	const desktop = boardMetricsForCell(50)
	const phone = boardMetricsForCell(20)
	for (const key of Object.keys(desktop)) assert.ok(Math.abs(phone[key] / desktop[key] - 0.4) < 1e-12, key)
	assert.equal(desktop.radius, 2)
	assert.equal(desktop.bevel, 2)
	assert.equal(desktop.outline, 3)
})

test('board finishes scale highlights, Scout outlines and Connector stripes; tray finishes stay unchanged', () => {
	const metrics = boardMetricsForCell(25)
	assert.match(tileFinish('#8e44ad', null, 'board', false, metrics).boxShadow, /inset 0 1px/)
	assert.match(tileFinish('#8e44ad', 'scout', 'board', false, metrics).boxShadow, /1.5px/)
	assert.match(tileFinish('#8e44ad', 'connector', 'board', false, metrics).background, /0 1px, transparent 1px 3.5px/)
	assert.deepEqual(tileFinish('#8e44ad', 'scout', 'tray', false, metrics), tileFinish('#8e44ad', 'scout', 'tray'))
})
