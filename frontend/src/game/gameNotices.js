function dismissedNoticesKey(gameId, playerId) {
	return `tipto-dismissed-notices-${gameId}-${playerId || 'guest'}`
}

export function readDismissedGameNotices(gameId, playerId, storage) {
	try {
		const saved = JSON.parse((storage ?? globalThis.localStorage).getItem(dismissedNoticesKey(gameId, playerId)) || '[]')
		return new Set(Array.isArray(saved) ? saved.filter(notice => typeof notice === 'string') : [])
	} catch {
		return new Set()
	}
}

export function saveDismissedGameNotices(gameId, playerId, notices, storage) {
	try {
		(storage ?? globalThis.localStorage).setItem(dismissedNoticesKey(gameId, playerId), JSON.stringify([...notices]))
	} catch {
		// Dismissal still works in memory if browser storage is unavailable.
	}
}

export function getNewGameNotice(previousNotice, nextNotice, dismissedNotices) {
	if (!nextNotice || nextNotice === previousNotice) return ''
	if (dismissedNotices?.has(nextNotice)) return ''
	if (nextNotice.startsWith('Game over.')) return ''
	if (nextNotice.endsWith(' goes first.')) return ''
	return nextNotice
}
