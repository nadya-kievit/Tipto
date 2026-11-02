import assert from 'node:assert/strict'
import test from 'node:test'
import { getNewGameNotice } from '../src/game/gameNotices.js'

test('new gameplay notices are shown', () => {
	const notice = 'Alex ran out of time. A piece was placed automatically.'
	assert.equal(getNewGameNotice('', notice), notice)
})

test('a persistent notice is not replayed after dismissal or another turn', () => {
	const notice = 'Alex ran out of moves. Their turns will be skipped.'
	assert.equal(getNewGameNotice('', notice), notice)
	for (let turn = 0; turn < 5; turn++) {
		assert.equal(getNewGameNotice(notice, notice), '')
	}
})

test('first-turn announcements are suppressed on initial games and restarts', () => {
	assert.equal(getNewGameNotice('', 'Alex goes first.'), '')
	assert.equal(getNewGameNotice('', 'New game started. Alex goes first.'), '')
})

test('winner, tie, and generic game-over announcements are suppressed', () => {
	for (const notice of [
		'Game over. Alex won with 50 blocks.',
		'Game over. Tie between Alex and Sam with 50 blocks.',
		'Game over.',
	]) {
		assert.equal(getNewGameNotice('', notice), '')
	}
})

test('empty snapshots add no message and genuinely new notices still appear', () => {
	assert.equal(getNewGameNotice('Old notice', null), '')
	assert.equal(getNewGameNotice('Old notice', undefined), '')
	assert.equal(getNewGameNotice('Old notice', ''), '')
	assert.equal(getNewGameNotice('Old notice', 'Sam left the game and became a bot.'), 'Sam left the game and became a bot.')
})
