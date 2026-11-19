// Start Vite, then run: node tests/lobby.browser.mjs [base URL] [Chrome path]
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] || 'http://127.0.0.1:5179'
const profile = await mkdtemp(join(tmpdir(), 'tipto-lobby-'))
const chrome = spawn(process.argv[3] || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-sandbox', '--no-first-run', '--disable-background-networking',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
const keepAlive = setInterval(() => {}, 1000)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
let ws, send

// Isolate the UI from the real backend and expose delayed replies and broadcasts.
function installFixture() {
  const game = {
    gameId: '123456', revision: 1, lobbyMode: true, status: 'waiting', adminPlayerId: 'p1',
    settings: { boardLayout: 'irregular', moveTimeLimitSeconds: 60 },
    players: [{ id: 'p1', name: 'Host', color: 'Blue' }, { id: 'p2', name: 'Guest', color: 'Red' }],
  }
  const fixture = window.lobbyFixture = {
    game, requests: [], sockets: [], pending: [], holdProfiles: false, failName: false,
    holdEntry: false, releaseEntry: null, resumed: false,
    emit() {
      game.revision++
      for (const socket of this.sockets) socket.onmessage?.({ data: JSON.stringify({ type: 'game_state', game }) })
    },
  }
  const NativeWebSocket = window.WebSocket
  window.WebSocket = class {
    constructor(url, ...args) {
      if (!String(url).includes('/games/')) return new NativeWebSocket(url, ...args)
      fixture.sockets.push(this)
      setTimeout(() => this.onopen?.(), 0)
    }
    close() {}
  }
  const reply = (data, status = 200) => ({ ok: status < 400, status, json: async () => structuredClone(data) })
  window.fetch = async (url, options = {}) => {
    const path = new URL(url, location.href).pathname
    const method = options.method || 'GET'
    const body = options.body ? JSON.parse(options.body) : null
    fixture.requests.push({ path, method, body })
    if (path === '/health') return reply({ status: 'ok' })
    if (method === 'GET' && path.startsWith('/games/')) {
      if (fixture.holdEntry) await new Promise(resolve => { fixture.releaseEntry = resolve })
      if (path === '/games/999999') return reply({ detail: 'Not found' }, 404)
      if (path === '/games/888888') return reply({ ...game, players: Array.from({ length: 6 }, (_, id) => ({ id })) })
      if (path === '/games/777777') return reply({ ...game, status: 'playing' })
      const token = options.headers?.['X-Player-Token']
      if (token === 'expired') return reply({ detail: 'Invalid session' }, 403)
      if (token === 'removed') return reply({ detail: 'You were removed from the room' }, 403)
      if (token === 'playing') {
        if (fixture.resumed) return new Promise(() => {})
        fixture.resumed = true
        return reply({ ...game, status: 'playing' })
      }
    }
    if (path.endsWith('/join')) return reply({ playerId: 'p1', playerToken: 'token' })
    if (path.endsWith('/profile')) {
      if (fixture.failName && body.name) return reply({ detail: 'Name save failed' }, 503)
      const complete = () => {
        if (body.name) game.players[0].name = body.name
        if (body.color) game.players[0].color = body.color
        game.revision++
        return reply(game)
      }
      if (fixture.holdProfiles) return new Promise(resolve => fixture.pending.push(() => resolve(complete())))
      return complete()
    }
    // Keep the Lobby mounted so request ordering and error recovery can be checked.
    if (path.endsWith('/start')) return reply({ detail: 'Test start response' }, 503)
    return reply(game)
  }
}

try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(Error('Chrome startup timed out')), 15000)
    chrome.on('error', reject)
    chrome.stderr.on('data', chunk => {
      output += chunk
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) { clearTimeout(timer); resolve(match[1]) }
    })
  })
  ws = new WebSocket(endpoint)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let id = 0
  const jobs = new Map(), errors = []
  ws.onmessage = event => {
    const msg = JSON.parse(event.data)
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails)
    if (!jobs.has(msg.id)) return
    const job = jobs.get(msg.id)
    jobs.delete(msg.id)
    clearTimeout(job.timer)
    if (msg.error) job.reject(Error(JSON.stringify(msg.error)))
    else job.resolve(msg.result)
  }
  send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const next = ++id
    const timer = setTimeout(() => reject(Error(`CDP timeout: ${method}`)), 15000)
    jobs.set(next, { resolve, reject, timer })
    ws.send(JSON.stringify({ id: next, method, params, sessionId }))
  })
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const command = (method, params) => send(method, params, sessionId)
  await command('Page.enable')
  await command('Runtime.enable')
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `(${installFixture})()` })
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const until = async expression => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return
      await wait(50)
    }
    throw Error(`Timed out: ${expression}`)
  }
  const open = async path => {
    await command('Page.navigate', { url: base + path })
    await until(`!!document.querySelector(${JSON.stringify(path === '/' ? '.homeCreateButton' : '.lobbyStart:not(:disabled)')})`)
  }
  const editName = async name => {
    await evaluate(`{
      const input = document.querySelector('.lobbyOwnProfile input'); input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(name)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }`)
    await wait(50)
  }
  const nameValue = () => evaluate(`document.querySelector('.lobbyOwnProfile input').value`)

  await open('/')
  await evaluate(`lobbyFixture.holdEntry = true`)
  await evaluate(`document.querySelector('.homeCreateButton').click()`)
  await until(`location.pathname === '/lobby/123456' && !!lobbyFixture.releaseEntry`)
  assert.equal(await evaluate(`!!document.querySelector('.lobbyLoading')`), true, 'Lobby owns entry loading')
  await evaluate(`lobbyFixture.holdEntry = false;lobbyFixture.releaseEntry()`)
  // This fixture treats room creation like any other game response.
  await until(`!!document.querySelector('.lobbyStart:not(:disabled)')`)
  assert.equal(await evaluate(`lobbyFixture.requests.filter(r => r.method === 'GET' && r.path === '/games/123456').length`), 2,
    'Lobby entry should run once despite StrictMode effect replays')
  assert.equal(await evaluate(`lobbyFixture.requests.filter(r => r.path.endsWith('/join')).length`), 1)

  await editName('My draft')
  await wait(350)
  assert.equal(await evaluate(`lobbyFixture.requests.filter(r => r.path.endsWith('/profile')).length`), 0, 'Typing should not save')
  await evaluate(`lobbyFixture.game.players.push({id:'p3',name:'New player',color:'Green'});lobbyFixture.emit()`)
  await until(`document.querySelectorAll('.lobbyPlayerRow').length === 3`)
  assert.equal(await nameValue(), 'My draft', 'Joining must not replace the local draft')
  await evaluate(`document.querySelector('.lobbyOwnProfile input').blur()`)
  await until(`lobbyFixture.game.players[0].name === 'My draft'`)

  await editName('First draft')
  await evaluate(`lobbyFixture.holdProfiles = true;document.querySelector('.lobbyOwnProfile input').blur()`)
  await until(`lobbyFixture.pending.length === 1`)
  await editName('Newer draft')
  await evaluate(`lobbyFixture.pending.shift()()`)
  await wait(100)
  assert.equal(await nameValue(), 'Newer draft', 'A delayed save must not replace newer typing')

  await evaluate(`lobbyFixture.requests=[];lobbyFixture.holdProfiles=false;lobbyFixture.failName=true`)
  await evaluate(`document.querySelector('.lobbyStart').click()`)
  await until(`document.querySelector('.lobbyError')?.textContent.includes('Name save failed')`)
  assert.equal(await evaluate(`lobbyFixture.requests.some(r=>r.path.endsWith('/start'))`), false, 'Failed name save must prevent Start')
  assert.equal(await nameValue(), 'Newer draft')

  await evaluate(`lobbyFixture.requests=[];lobbyFixture.failName=false;lobbyFixture.holdProfiles=true;document.querySelector('.lobbyStart').click()`)
  await until(`lobbyFixture.pending.length === 1`)
  assert.equal(await evaluate(`lobbyFixture.requests.some(r=>r.path.endsWith('/start'))`), false)
  assert.equal(await evaluate(`document.querySelector('.lobbyStart').disabled`), true)
  await evaluate(`lobbyFixture.pending.shift()()`)
  await until(`lobbyFixture.requests.some(r=>r.path.endsWith('/start'))`)
  assert.equal(await evaluate(`lobbyFixture.game.players[0].name`), 'Newer draft')

  await open('/lobby/123456')
  assert.equal(await evaluate(`lobbyFixture.requests.filter(r=>r.method==='GET'&&r.path==='/games/123456').length`), 1, 'Reload restores saved session')
  await evaluate(`localStorage.clear()`)
  await open('/lobby/123456')
  assert.equal(await evaluate(`lobbyFixture.requests.filter(r=>r.path.endsWith('/join')).length`), 1, 'Direct link joins without an existing session')
  await editName('   ')
  await evaluate(`document.querySelector('.lobbyOwnProfile input').blur()`)
  await until(`document.querySelector('.lobbyOwnProfile input').value === 'Host'`)

  await evaluate(`lobbyFixture.requests=[];lobbyFixture.holdProfiles=true;
    document.querySelector('[title="Orange"]').click();document.querySelector('[title="Purple"]').click()`)
  await until(`lobbyFixture.pending.length === 2`)
  assert.equal(await evaluate(`lobbyFixture.requests.filter(r=>r.path.endsWith('/profile')).length`), 2, 'Colour changes are sent without a queue')
  await evaluate(`lobbyFixture.pending.pop()();lobbyFixture.pending.pop()()`)
  await wait(100)
  assert.equal(await evaluate(`document.querySelector('.lobbySwatch[data-selected="true"]').title`), 'Orange')

  await evaluate(`localStorage.setItem('tipto-player-123456', JSON.stringify({playerId:'p1',playerToken:'expired'}))`)
  await open('/lobby/123456')
  assert.equal(await evaluate(`lobbyFixture.requests.filter(r=>r.path.endsWith('/join')).length`), 1, 'Expired credentials allow a fresh join')

  await evaluate(`localStorage.clear()`)
  for (const [roomId, message] of [['999999', 'We couldn’t find a game with that code.'], ['888888', 'Room is full'], ['777777', 'This room is no longer accepting players.']]) {
    await command('Page.navigate', { url: base + '/lobby/' + roomId })
    await until(`!!document.querySelector('.lobbyError')`)
    assert.equal(await evaluate(`document.querySelector('.lobbyError').textContent.trim()`), message)
    assert.equal(await evaluate(`lobbyFixture.requests.some(r=>r.path.endsWith('/join'))`), false)
    await evaluate(`document.querySelector('.headerLeave').click()`)
    await until(`!!document.querySelector('.homeCreateButton')`)
  }

  // A Home join navigates before the lobby reports an invalid code.
  await evaluate(`{
    const input = document.querySelector('.homeJoinForm input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '999999');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }`)
  await until(`!document.querySelector('.homeJoinButton').disabled`)
  await evaluate(`document.querySelector('.homeJoinButton').click()`)
  await until(`location.pathname === '/lobby/999999' && !!document.querySelector('.lobbyError')`)

  await evaluate(`localStorage.setItem('tipto-player-123456', JSON.stringify({playerId:'p1',playerToken:'removed'}))`)
  await command('Page.navigate', { url: base + '/lobby/123456' })
  await until(`!!document.querySelector('.homeError')`)
  assert.equal(await evaluate(`document.querySelector('.homeError').textContent.trim()`), 'You were removed from the room')
  assert.equal(await evaluate(`localStorage.getItem('tipto-player-123456')`), null)

  await evaluate(`localStorage.setItem('tipto-player-123456', JSON.stringify({playerId:'p1',playerToken:'playing'}))`)
  await command('Page.navigate', { url: base + '/lobby/123456' })
  await until(`location.pathname === '/game/123456'`)
  assert.deepEqual(errors, [], 'No browser runtime errors')
  console.log('Lobby browser checks passed: lobby-owned entry/loading, single joins, direct links, reload, expired/removed sessions, entry errors and leaving, active-game redirect, name editing, Start ordering/failure, and concurrent colour saves.')
} finally {
  if (send && ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => {})
  ws?.close()
  chrome.kill()
  clearInterval(keepAlive)
}
