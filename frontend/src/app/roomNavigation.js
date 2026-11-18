export function createRoomNavigation(browser, onPath, getLeaveHandler) {

	//determine if the url is currently in a room
	const isRoom = path => /^\/(lobby|game)\/[^/]+$/.test(path)
	const { history } = browser

	let path = browser.location.pathname
	let leaving = false
	let restoring = false
	let promptOnRestore = false
	let position = Number.isInteger(history.state?.tiptoPosition) ? history.state.tiptoPosition : 0
	const write = (method, next) => history[method]({ tiptoNavigation: true, tiptoPosition: position }, '', next)

	if (isRoom(path) && !Number.isInteger(history.state?.tiptoPosition)) {
		write('replaceState', '/')
		position++
		write('pushState', path)
	} else {
		write('replaceState', path)
	}

	const navigateTo = next => {
		//retire the room if navigating to home while in a game
		if (next === '/' && isRoom(path)) {
			write('replaceState', '/')
			path = '/'
			onPath(path)
			history.go(-1)
			return
		}
		//if destination is different from current path, update browser URL and history
		if (next !== path) {
			const replace = next === '/' || isRoom(path)
			if (!replace) position++
			write(replace ? 'replaceState' : 'pushState', next)
		}
		//navigate to next
		path = next
		onPath(next)
	}

	const onPopState = async () => {
		//currently in a room
		if (isRoom(path)) {
			if (history.state?.tiptoPosition !== position || browser.location.pathname !== path) {
				promptOnRestore ||= !leaving
				if (!restoring) {
					restoring = true
					// Reuse the original entry. A fresh pushState here can make the
					// browser skip our history on the next toolbar Back press.
					const target = history.state?.tiptoPosition
					history.go(Number.isInteger(target) ? position - target : 1)
				}
				return
			}
			if (!restoring) return
			restoring = false
			
			if (!promptOnRestore) return
			promptOnRestore = false
			if (leaving) return

			//user confirmed leave, exit the game
			const leave = getLeaveHandler()
			if (!leave) return
			leaving = true
			try { await leave() } finally { leaving = false }
		
		//not in a room
		} else {
			position = history.state?.tiptoPosition ?? 0
			//if clicking forward leads to an old game, redirect to home
			if (isRoom(browser.location.pathname)) write('replaceState', '/')

			//navigate to next path
			path = browser.location.pathname
			onPath(path)
		}
	}

	browser.addEventListener('popstate', onPopState)
	return { navigateTo, dispose: () => browser.removeEventListener('popstate', onPopState) }
}
