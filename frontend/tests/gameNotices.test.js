import assert from 'node:assert/strict'
import test from 'node:test'
import { getNewGameNotice, readDismissedGameNotices, saveDismissedGameNotices } from '../src/game/gameNotices.js'

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

function memoryStorage() {
	const values = new Map()
	return {
		getItem: key => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value),
	}
}

test('dismissed notices stay hidden after reload, including after other messages', () => {
	const storage = memoryStorage()
	const notice = 'Alex ran out of moves. Their turns will be skipped.'
	const dismissed = readDismissedGameNotices('room1', 'player1', storage)
	assert.equal(getNewGameNotice('', notice, dismissed), notice)
	assert.equal(getNewGameNotice('', notice, readDismissedGameNotices('room1', 'player1', storage)), notice, 'an undismissed notice remains visible after reload')
	dismissed.add(notice)
	saveDismissedGameNotices('room1', 'player1', dismissed, storage)
	const reloaded = readDismissedGameNotices('room1', 'player1', storage)
	assert.equal(getNewGameNotice('', notice, reloaded), '')
	assert.equal(getNewGameNotice('Another notice', notice, reloaded), '')
	const next = 'Sam left the game and became a bot.'
	assert.equal(getNewGameNotice(notice, next, reloaded), next)
	assert.equal(getNewGameNotice('', next, reloaded), next)
})

test('dismissals are separate for each room and player', () => {
	const storage = memoryStorage()
	saveDismissedGameNotices('room1', 'player1', new Set(['A notice']), storage)
	assert.equal(readDismissedGameNotices('room1', 'player1', storage).has('A notice'), true)
	assert.equal(readDismissedGameNotices('room2', 'player1', storage).has('A notice'), false)
	assert.equal(readDismissedGameNotices('room1', 'player2', storage).has('A notice'), false)
})

test('multiple dismissed messages survive subsequent reloads', () => {
	const storage = memoryStorage()
	saveDismissedGameNotices('room', 'player', new Set(['First notice']), storage)
	const reloaded = readDismissedGameNotices('room', 'player', storage)
	reloaded.add('Second notice')
	saveDismissedGameNotices('room', 'player', reloaded, storage)
	assert.deepEqual([...readDismissedGameNotices('room', 'player', storage)], ['First notice', 'Second notice'])
})

test('corrupt or blocked browser storage does not break notices or dismissal', () => {
	for (const saved of ['invalid JSON', '{}', 'null']) {
		assert.deepEqual([...readDismissedGameNotices('room', 'player', { getItem: () => saved })], [])
	}
	const blocked = {
		getItem: () => { throw new Error('Storage blocked') },
		setItem: () => { throw new Error('Storage blocked') },
	}
	assert.deepEqual([...readDismissedGameNotices('room', 'player', blocked)], [])
	const dismissed = new Set(['A notice'])
	assert.doesNotThrow(() => saveDismissedGameNotices('room', 'player', dismissed, blocked))
	assert.equal(getNewGameNotice('', 'A notice', dismissed), '')
})
