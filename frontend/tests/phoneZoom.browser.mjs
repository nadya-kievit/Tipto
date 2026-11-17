// Start Vite, then: node tests/phoneZoom.browser.mjs [base URL] [Chrome path]
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] || 'http://127.0.0.1:5178'
const chrome = process.argv[3] || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const configs = JSON.parse(await readFile(new URL('../../backend/app/game/board_layouts_15.json', import.meta.url))).boards
const profile = await mkdtemp(join(tmpdir(), 'tipto-phone-zoom-'))
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--no-first-run', '--disable-background-networking',
 '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
const keepAlive = setInterval(() => {}, 1000)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
let ws, send
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
  const msg = JSON.parse(event.data)
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails)
  if (!msg.id || !jobs.has(msg.id)) return
  const job = jobs.get(msg.id)
  jobs.delete(msg.id)
  clearTimeout(job.timer)
  if (msg.error) job.reject(Error(JSON.stringify(msg.error)))
  else job.resolve(msg.result)
 })
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
 await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
 await command('Emulation.setTouchEmulationEnabled', { enabled: true })
 const evaluate = async expression => {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
 }
 const fixture = (count, layout = count === 6 ? 'rooms' : 'irregular') => {
  const config = configs.find(c => c.id === `${layout}-${count}`)
  const mask = new Set(config.cells.map(([c, r]) => `${r},${c}`))
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, settingsPlayerKey: `slot${i}`,
   color: ['Purple', 'Orange', 'Red', 'Blue', 'Green', 'Yellow'][i],
   startPosition: { row: config.startPositions[i][1], col: config.startPositions[i][0] },
   pieces: Array.from({ length: 16 }, (_, p) => ({ name: `P${p}`, cells: p === 0 ? [[0, 0]] : [[0, 0], [0, 1], [1, 0]],
    placed: false, ability: p === 14 ? 'scout' : p === 15 ? 'connector' : null })),
  }))
  return { gameId: 'zoomtest', status: 'playing', currentPlayerId: 'p0', revision: 1, turnNumber: 1, moveHistory: [],
   players, settings: { players: Object.fromEntries(players.map(p => [p.settingsPlayerKey, {}])) },
   board: Array.from({ length: config.height }, (_, r) => Array.from({ length: config.width }, (_, c) =>
    ({ playable: mask.has(`${r},${c}`), occupied: false, player: null, pieceId: null }))),
  }
 }
 let script
 const load = async (count, layout) => {
  if (script) await command('Page.removeScriptToEvaluateOnNewDocument', { identifier: script })
  const result = await command('Page.addScriptToEvaluateOnNewDocument', { source: `
   window.__game=${JSON.stringify(fixture(count, layout))}; window.__sent=[]; window.__sockets=[];
   localStorage.setItem('tipto-player-zoomtest',JSON.stringify({playerId:'p0',playerToken:'test'}));
   const fetchOriginal=fetch;
   window.fetch=(url,options)=>String(url).includes('/games/zoomtest')?Promise.resolve(new Response(JSON.stringify(window.__game),{status:200,headers:{'Content-Type':'application/json'}})):fetchOriginal(url,options);
   const NativeSocket=WebSocket;
   window.WebSocket=class {static OPEN=1;static CONNECTING=0;constructor(url,protocols){if(!String(url).includes('/games/zoomtest/'))return new NativeSocket(url,protocols);window.__sockets.push(this);this.readyState=1}close(){this.readyState=3}send(message){window.__sent.push(JSON.parse(message))}};
  ` })
  script = result.identifier
  await command('Page.navigate', { url: `${base}/game/zoomtest` })
  for (let i = 0; i < 100; i++) {
   if (await evaluate(`!!document.querySelector('[data-game-board]')`)) break
   await wait(100)
  }
  await wait(200)
  assert.ok(await evaluate(`!!document.querySelector('.phoneGame')`), 'Phone game did not load')
 }
 const box = selector => evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,x:r.left+r.width/2,y:r.top+r.height/2}})()`)
 const start = p => command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] })
 const move = p => command('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y, id: 1 }] })
 const end = () => command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
 const tap = async p => { await start(p); await end(); await wait(700) }
 const status = () => evaluate(`(() => {
  const root=document.querySelector('.phoneGame'), b=document.querySelector('.gameBoardSurface');
  const m=new DOMMatrix(getComputedStyle(b).transform), g=document.querySelector('.ghostLayer'), mini=document.querySelector('.phoneMini');
  return {mode:root.dataset.viewMode,s:m.a,tx:m.e,ty:m.f,dragging:root.classList.contains('dragging'),
   ghost:!g.hidden,home:!!document.querySelector('.pc.home'),
   mini:mini?{display:getComputedStyle(mini).display,opacity:getComputedStyle(mini).opacity,frame:mini.querySelector('canvas').dataset.hasFrame}:null,
   sent:window.__sent.length};
 })()`)
 const pickup = async (index = 0) => {
  const point = await box(`.tray .pc:nth-child(${index + 1})`)
  await start(point)
  await wait(160)
  return point
 }
 const carry = (pickup, x, y) => move({ x: pickup.x + (x - pickup.x) / 1.7, y: pickup.y + (y - pickup.y + 56) / 1.7 })
 const escape = async () => {
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await end()
  await wait(700)
 }
 const screenshot = async name => {
  if (!process.env.TIPTO_BROWSER_SCREENSHOTS) return
  const { data } = await command('Page.captureScreenshot', { format: 'png' })
  const path = join(profile, `${name}.png`)
  await writeFile(path, Buffer.from(data, 'base64'))
  console.log(`Screenshot: ${path}`)
 }

 for (const count of [2, 3]) {
  await load(count)
  assert.equal(await evaluate(`document.querySelectorAll('.phoneView,.phoneMini').length`), 0)
  assert.equal(await evaluate(`document.querySelectorAll('.portal').length`), 2)
  const before = await status()
  await tap(await box('[data-game-board]'))
  assert.equal((await status()).s, before.s)
  const point = await pickup(), board = await box('[data-game-board]')
  await carry(point, board.x, board.y)
  await wait(600)
  assert.equal((await status()).s, before.s)
  await escape()
  assert.equal((await status()).sent, 0)
  console.log(`${count} players: legacy fit, drag and portal elements preserved`)
 }
 for (const count of [4, 6]) {
  await load(count)
  const initial = await status(), view = await box('.phoneView')
  assert.equal(initial.mode, 'over')
  assert.equal(initial.mini.display, 'none')
  assert.equal(await evaluate(`document.querySelectorAll('.portal').length`), 0)
  await tap(view)
  let zoomed = await status()
  assert.ok(Math.abs(zoomed.s - 0.8) < 1e-6)
  assert.equal(zoomed.mini.display, 'block')
  // A second finger cancels the pan; it cannot pinch or move the camera.
  await start(view)
  await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
   { x: view.x, y: view.y, id: 1 }, { x: view.x + 25, y: view.y, id: 2 },
  ] })
  await command('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
   { x: view.x - 30, y: view.y, id: 1 }, { x: view.x + 55, y: view.y, id: 2 },
  ] })
  await end()
  assert.equal((await status()).tx, zoomed.tx)
  assert.equal(await evaluate('visualViewport.scale'), 1)
  await start({ x: view.x, y: view.y })
  await move({ x: view.x + 50, y: view.y + 25 })
  await end()
  await wait(100)
  assert.notEqual((await status()).tx, zoomed.tx)
  const mini = await box('.phoneMini'), beforeMini = await status()
  await start(mini)
  await move({ x: mini.x + 20, y: mini.y })
  await end()
  await wait(100)
  assert.notEqual((await status()).tx, beforeMini.tx)
  await tap(await box('.phoneMini'))
  assert.equal((await status()).mode, 'over')
  const point = await pickup()
  await carry(point, view.x, view.y)
  await wait(1800)
  zoomed = await status()
  assert.ok(Math.abs(zoomed.s - 0.8) < 1e-6, `Pause zoom failed: ${JSON.stringify(zoomed)}`)
  assert.equal(zoomed.mini.opacity, '0')
  assert.equal(zoomed.ghost, !zoomed.home)
  await screenshot(`carrying-${count}`)
  await carry(point, view.x, view.bottom + 65)
  await wait(1100)
  assert.equal((await status()).mode, 'over')
  await end()
  await wait(700)
  assert.equal((await status()).sent, 0)
  console.log(`${count} players: tap zoom, pan, minimap, pause zoom and off-board zoom-out passed`)
 }

 // Hover remains resolved through portal turns; the camera stays put.
 await load(6)
 const view = await box('.phoneView')
 await tap(view)
 const before = await status(), point = await pickup(1)
 await carry(point, view.left - 35, view.y)
 await wait(1100)
 const turned = await status()
 assert.ok(Math.abs(turned.tx - before.tx) < 0.01 && Math.abs(turned.ty - before.ty) < 0.01)
 assert.equal(turned.s, before.s)
 assert.equal(turned.ghost, !turned.home)
 assert.equal(await evaluate(`document.querySelector('.dh[data-side="flip"]').style.getPropertyValue('--amt')`), '1.00')
 assert.equal(await evaluate(`getComputedStyle(document.querySelector('.dh'),'::before').content`), 'none')
 assert.ok(await evaluate(`parseFloat(getComputedStyle(document.querySelector('.dh'),'::after').height)>100`))
 await escape()
 assert.equal((await status()).mode, 'over')
 console.log('Portal hold/repeat, unified line, zoom suppression and hover passed')

 for (const side of ['left', 'right', 'top', 'bottom']) {
  await load(6)
  const rect = await box('.phoneView')
  await tap(rect)
  const before = await status(), point = await pickup()
  const x = side === 'left' ? rect.left + 18 : side === 'right' ? rect.right - 18 : rect.x
  const y = side === 'top' ? rect.top + 18 : side === 'bottom' ? rect.bottom - 18 : rect.y
  await carry(point, x, y)
  await wait(1050)
  const after = await status()
  const movement = side === 'left' ? after.tx - before.tx : side === 'right' ? before.tx - after.tx
   : side === 'top' ? after.ty - before.ty : before.ty - after.ty
  assert.ok(movement > 1, `${side} camera did not move: ${JSON.stringify({ before, after })}`)
  await escape()
  console.log(`${side} camera follow passed`)
 }

 // Release during zoom-in must reach the zoomed endpoint, then valid placement
 // keeps it there. Off-board release instead completes that zoom before overview.
 for (const valid of [true, false]) {
  await load(6)
  const rect = await box('.phoneView'), point = await pickup()
  await carry(point, rect.x, rect.y)
  for (let i = 0; i < 30; i++) {
   const current = await status()
   if (current.s > 0.55 && current.s < 0.78) break
   await wait(40)
  }
  if (!valid) await carry(point, rect.x, rect.bottom + 65)
  await end()
  let maximum = 0
  for (let i = 0; i < 35; i++) { maximum = Math.max(maximum, (await status()).s); await wait(45) }
  const final = await status()
  assert.ok(maximum >= 0.799, 'Started zoom-in was interrupted')
  assert.equal(final.mode, valid ? 'zoom' : 'over')
  assert.equal(final.sent, valid ? 1 : 0)
 }
 console.log('Release mid-zoom, valid placement retention and cancelled return passed')
 await load(4, 'square')
 await tap(await box('.phoneView'))
 assert.equal((await status()).mini.frame, 'false')
 await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
 await load(6)
 await start(await box('.phoneView'))
 await end()
 await wait(40)
 assert.equal((await status()).s, 0.8, 'Reduced motion must jump instantly')
 await command('Emulation.setEmulatedMedia', { features: [] })
 await load(6)
 const timedGame = await evaluate(`window.__game.turnEndsAt=Date.now()+700;window.__game.revision=2;for(const s of window.__sockets)if(s.readyState===1)s.onmessage?.({data:JSON.stringify({type:'game_state',game:window.__game})});true`)
 assert.equal(timedGame, true)
 await wait(80)
 const timedPoint = await pickup(), timedRect = await box('.phoneView')
 await carry(timedPoint, timedRect.x, timedRect.y)
 await wait(750)
 assert.equal((await status()).dragging, false, 'Turn expiry must cancel the drag')
 assert.equal((await status()).sent, 0)
 await end()
 console.log('Minimap dragging, two-finger rejection, reduced motion and turn-expiry guards passed')
 assert.deepEqual(errors, [], 'Browser runtime errors')
 console.log('Phone zoom browser checks passed')
} finally {
 if (send && ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => {})
 ws?.close()
 browser.kill()
 clearInterval(keepAlive)
}
