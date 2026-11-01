import assert from 'node:assert/strict'
import test from 'node:test'
import { createRoomNavigation } from '../src/app/roomNavigation.js'

function browserAt(path = '/') {
	const entries = [{ path, state: null }]
	let index = 0
	let pushes = 0
	const pendingMoves = []
	const listeners = new Set()
	const browser = {
		location: { get pathname() { return entries[index].path } },
		history: {
			get state() { return entries[index].state },
			pushState(state, _, path) { pushes++; entries.splice(++index); entries.push({ state, path }) },
			replaceState(state, _, path) { entries[index] = { state, path } },
			go(delta) { pendingMoves.push(delta) },
		},
		addEventListener(_, fn) { listeners.add(fn) },
		removeEventListener(_, fn) { listeners.delete(fn) },
		async move(delta) {
			if (!entries[index + delta]) return
			index += delta
			await Promise.all([...listeners].map(fn => fn()))
			while (pendingMoves.length) await browser.move(pendingMoves.shift())
		},
		get paths() { return entries.map(entry => entry.path) },
		get pushes() { return pushes },
	}
	return browser
}

test('Back from lobby runs Leave and Forward cannot reopen the room', async () => {
	const browser = browserAt()
	let displayed = '/', leaves = 0
	const nav = createRoomNavigation(browser, next => { displayed = next }, () => () => { leaves++; nav.navigateTo('/') })
	nav.navigateTo('/lobby/123456')
	await browser.move(-1)
	assert.equal(leaves, 1)
	assert.equal(displayed, '/')
	assert.deepEqual(browser.paths, ['/', '/'])
	await browser.move(1)
	assert.equal(browser.location.pathname, '/')
})

test('starting replaces Lobby so Back from Game calls its own Leave action', async () => {
	const browser = browserAt()
	let displayed = '/', leftFrom
	const nav = createRoomNavigation(browser, next => { displayed = next }, () => () => { leftFrom = displayed; nav.navigateTo('/') })
	nav.navigateTo('/lobby/123456')
	nav.navigateTo('/game/123456')
	assert.deepEqual(browser.paths, ['/', '/game/123456'])
	await browser.move(-1)
	assert.equal(leftFrom, '/game/123456')
	assert.equal(displayed, '/')
})

test('cancelling or failing Leave keeps the URL and game mounted', async () => {
	const browser = browserAt('/game/123456')
	let displayed = browser.location.pathname, attempts = 0
	createRoomNavigation(browser, next => { displayed = next }, () => () => { attempts++ })
	await browser.move(-1)
	assert.equal(displayed, '/game/123456')
	assert.equal(browser.location.pathname, displayed)
	await browser.move(-1)
	assert.equal(attempts, 2)
	assert.deepEqual(browser.paths, ['/', '/game/123456'])
})

test('repeated cancelled Back restores the original game entry without pushing new history', async () => {
	const browser = browserAt('/game/123456')
	let attempts = 0
	createRoomNavigation(browser, () => {}, () => () => { attempts++ })
	const pushes = browser.pushes
	for (let i = 0; i < 5; i++) {
		await browser.move(-1)
		assert.equal(attempts, i + 1)
		assert.equal(browser.location.pathname, '/game/123456')
		assert.equal(browser.pushes, pushes)
	}
})

test('repeated Back while Leave is pending submits only once', async () => {
	const browser = browserAt('/game/123456')
	let resolveLeave, calls = 0
	const nav = createRoomNavigation(browser, () => {}, () => () => {
		calls++
		return new Promise(resolve => { resolveLeave = () => { nav.navigateTo('/'); resolve() } })
	})
	const pending = browser.move(-1)
	await new Promise(resolve => setImmediate(resolve))
	await browser.move(-1)
	assert.equal(calls, 1)
	resolveLeave()
	await pending
	assert.equal(browser.location.pathname, '/')
})

test('Leave button replaces the room entry and later history traversal stays home', async () => {
	const browser = browserAt('/game/123456')
	const nav = createRoomNavigation(browser, () => {}, () => null)
	nav.navigateTo('/')
	await browser.move(-1)
	await browser.move(1)
	assert.deepEqual(browser.paths, ['/', '/'])
})

test('stale Forward entry cannot rejoin a room from Home', async () => {
	const browser = browserAt()
	browser.history.pushState({}, '', '/lobby/old')
	await browser.move(-1)
	let displayed
	createRoomNavigation(browser, next => { displayed = next }, () => null)
	await browser.move(1)
	assert.equal(browser.location.pathname, '/')
	assert.equal(displayed, '/')
})

test('reinitializing after reload does not add another history entry', () => {
	const browser = browserAt('/game/123456')
	const nav = createRoomNavigation(browser, () => {}, () => null)
	nav.dispose()
	createRoomNavigation(browser, () => {}, () => null)
	assert.deepEqual(browser.paths, ['/', '/game/123456'])
})
