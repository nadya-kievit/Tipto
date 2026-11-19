// Start Vite, then: node tests/playerPieces.browser.mjs [base URL] [Chrome path]
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] || 'http://127.0.0.1:5178'
const profile = await mkdtemp(join(tmpdir(), 'tipto-player-pieces-'))
const browser = spawn(process.argv[3] || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-sandbox', '--no-first-run', '--disable-background-networking',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
let ws, command
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(Error('Chrome startup timed out')), 15000)
    browser.on('error', reject)
    browser.stderr.on('data', chunk => {
      output += chunk
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) { clearTimeout(timer); resolve(match[1]) }
    })
  })
  ws = new WebSocket(endpoint)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject) })
  let id = 0
  const jobs = new Map(), errors = []
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    const job = jobs.get(message.id)
    if (!job) return
    jobs.delete(message.id)
    clearTimeout(job.timer)
    if (message.error) job.reject(Error(JSON.stringify(message.error)))
    else job.resolve(message.result)
  })
  command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const next = ++id
    const timer = setTimeout(() => reject(Error(`CDP timeout: ${method}`)), 15000)
    jobs.set(next, { resolve, reject, timer })
    ws.send(JSON.stringify({ id: next, method, params, sessionId }))
  })
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true })
  const page = (method, params) => command(method, params, sessionId)
  const evaluate = async expression => {
    const result = await page('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  await page('Page.enable')
  await page('Runtime.enable')
  const players = Array.from({ length: 6 }, (_, i) => ({
    id: `p${i}`, name: `Player ${i}`, settingsPlayerKey: `slot${i}`,
    color: ['Purple', 'Orange', 'Red', 'Blue', 'Green', 'Yellow'][i],
    startPosition: { row: i * 2, col: i * 2 },
    pieces: Array.from({ length: 16 }, (_, p) => ({
      name: `P${p}`, cells: [[0, 0], [0, 1], [1, 0]], placed: i === 1 && p === 0,
      ability: p === 14 ? 'scout' : p === 15 ? 'connector' : null,
    })),
  }))
  const game = { gameId: 'popover-test', status: 'playing', currentPlayerId: 'p0', revision: 1,
    turnNumber: 1, moveHistory: [], players,
    settings: { players: Object.fromEntries(players.map(p => [p.settingsPlayerKey, {}])) },
    board: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ playable: true, occupied: false }))),
  }
  await page('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('tipto-player-popover-test',JSON.stringify({playerId:'p0',playerToken:'test'}));
    const game=${JSON.stringify(game)}, nativeFetch=fetch, NativeSocket=WebSocket;
    window.fetch=(url,options)=>String(url).includes('/games/popover-test')?Promise.resolve(new Response(JSON.stringify(game),{status:200,headers:{'Content-Type':'application/json'}})):nativeFetch(url,options);
    window.WebSocket=class {static OPEN=1;constructor(url,protocols){if(!String(url).includes('/games/popover-test/'))return new NativeSocket(url,protocols);this.readyState=1}close(){this.readyState=3}send(){}};
  ` })
  await page('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
  await page('Page.navigate', { url: `${base}/game/popover-test` })
  for (let i = 0; i < 100; i++) {
    if (await evaluate(`document.querySelectorAll('.playerStatusCard').length === 6`)) break
    await wait(100)
  }
  const geometry = () => evaluate(`(() => {
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
    const pop=document.querySelector('.playerPiecesPopover:popover-open'),card=pop?.closest('.playerStatusCard'),r=pop?.getBoundingClientRect();
    return {cards:[...document.querySelectorAll('.playerStatusCard')].map(rect),card:card&&rect(card),pop:pop&&rect(pop),count:pop?.querySelectorAll('.pieceCard').length,
      hit:pop&&pop.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)),shape:pop&&rect(pop.querySelector('.pieceShape'))};
  })()`)
  for (const [width, height, portrait] of [[1920, 1080, false], [900, 1200, true]]) {
    await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await wait(300)
    const before = await geometry()
    await evaluate(`document.querySelector('.viewPiecesButton').click()`)
    await wait(100)
    const after = await geometry()
    assert.deepEqual(after.cards, before.cards, 'Opening must not move or resize player cards')
    assert.equal(after.count, 15, 'Only unplaced pieces are shown')
    assert.ok(portrait ? after.pop.top >= after.card.bottom : after.pop.left >= after.card.right, 'Popover opens on the correct side')
    assert.ok(Math.abs(portrait ? after.pop.left - after.card.left : after.pop.top - after.card.top) < 1, 'Popover aligns with its own player card')
    assert.ok(after.pop.right <= width, 'Popover fits the viewport')
    assert.ok(after.hit, 'Popover appears above the board without clipping')
    assert.equal(after.shape.width, 17, 'Both layouts use 8px cells with 1px gaps')
    assert.equal(await evaluate(`document.querySelector('.viewPiecesButton').innerText`), 'Hide')
    await evaluate(`document.querySelector('.playerPiecesPopover:popover-open .pieceCard').click()`)
    assert.ok((await geometry()).pop, 'Clicking pieces keeps the popover open')
    await page('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    await page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    assert.equal((await geometry()).pop, null, 'Escape closes the popover')
    assert.equal(await evaluate(`document.querySelector('.viewPiecesButton').innerText`), 'Pieces')
    await evaluate(`document.querySelector('.viewPiecesButton').click()`)
    await page('Input.dispatchMouseEvent', { type: 'mousePressed', x: width - 5, y: height - 5, button: 'left', clickCount: 1 })
    await page('Input.dispatchMouseEvent', { type: 'mouseReleased', x: width - 5, y: height - 5, button: 'left', clickCount: 1 })
    assert.equal((await geometry()).pop, null, 'Outside clicks close the popover')
    await evaluate(`document.querySelector('.viewPiecesButton').click(); document.querySelectorAll('.viewPiecesButton')[1].click()`)
    assert.equal(await evaluate(`document.querySelectorAll('.playerPiecesPopover:popover-open').length`), 1, 'Opening another player closes the previous popover')
    const other = await geometry()
    assert.ok(Math.abs(portrait ? other.pop.left - other.card.left : other.pop.top - other.card.top) < 1, 'Each popover anchors to its own card')
    await evaluate(`document.querySelectorAll('.viewPiecesButton')[1].click()`)
    assert.equal((await geometry()).pop, null, 'The Pieces button also toggles the popover closed')
  }
  assert.deepEqual(errors, [], 'Browser runtime errors')
  console.log('Player pieces browser checks passed: placement, overlay, stable layout, filtering, sizing and dismissal')
} finally {
  if (command && ws?.readyState === WebSocket.OPEN) await command('Browser.close').catch(() => {})
  ws?.close()
  browser.kill()
}
