const isRoom = path => /^\/(lobby|game)\/[^/]+$/.test(path)

// A room occupies one history entry above Home. Starting a game replaces the
// lobby entry; leaving replaces the room entry, so Forward cannot reopen it.
export function createRoomNavigation(browser, onPath, getLeaveHandler) {
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
		if (next !== path) {
			const replace = next === '/' || isRoom(path)
			if (!replace) position++
			write(replace ? 'replaceState' : 'pushState', next)
		}
		path = next
		onPath(next)
	}
	const onPopState = async () => {
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
			const shouldPrompt = promptOnRestore
			promptOnRestore = false
			if (!shouldPrompt) return
			if (leaving) return
			const leave = getLeaveHandler()
			if (!leave) return
			leaving = true
			try { await leave() } finally { leaving = false }
		} else {
			// History from an earlier visit must not silently rejoin a room.
			position = history.state?.tiptoPosition ?? 0
			if (isRoom(browser.location.pathname)) write('replaceState', '/')
			path = browser.location.pathname
			onPath(path)
		}
	}
	browser.addEventListener('popstate', onPopState)
	return { navigateTo, dispose: () => browser.removeEventListener('popstate', onPopState) }
}
