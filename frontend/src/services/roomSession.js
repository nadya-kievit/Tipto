import { getGame, joinGame } from './api'

const pendingEntries = new Map()

export function enterLobby(gameId) {
	if (pendingEntries.has(gameId)) return pendingEntries.get(gameId)

	const entry = (async () => {
		const storageKey = `tipto-player-${gameId}`
		const saved = localStorage.getItem(storageKey)
		if (saved) {
			const credentials = JSON.parse(saved)
			try {
				return { game: await getGame(gameId, credentials), credentials }
			} catch (error) {
				if (error.status !== 403) throw error
				localStorage.removeItem(storageKey)
				if (error.message === 'You were removed from the room') throw error
			}
		}

		const room = await getGame(gameId)
		if (room.players.length >= 6) throw new Error('Room is full')
		if (!room.lobbyMode || room.status !== 'waiting') {
			throw new Error('This room is no longer accepting players.')
		}
		const adminToken = localStorage.getItem(`tipto-admin-${gameId}`) || undefined
		const credentials = await joinGame(gameId, undefined, undefined, adminToken)
		localStorage.setItem(storageKey, JSON.stringify(credentials))
		return { game: await getGame(gameId, credentials), credentials }
	})()

	pendingEntries.set(gameId, entry)
	entry.then(
		() => pendingEntries.delete(gameId),
		() => pendingEntries.delete(gameId),
	)
	return entry
}
