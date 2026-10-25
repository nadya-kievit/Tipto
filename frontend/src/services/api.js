const removeTrailingSlash = (url) => url.replace(/\/+$/, '')

const API_BASE = removeTrailingSlash(
  	import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'
)

const WS_BASE = removeTrailingSlash(
  	import.meta.env.VITE_WS_BASE || 'ws://127.0.0.1:8000'
)


export async function wakeGameServer() {
	await fetch(`${API_BASE}/health`)
}


async function parseResponse(response) {
	const data = await response.json()

	if (!response.ok) {
		const error = new Error(typeof data.detail === 'string' ? data.detail : 'Request failed.')
		error.status = response.status
		throw error
	}

	return data
}


export async function createGame(settings) {
	const response = await fetch(`${API_BASE}/games`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ settings })
	})

	return parseResponse(response)
}


export async function getGame(gameId, credentials) {
	const response = await fetch(`${API_BASE}/games/${gameId}`, {
		headers: credentials ? {
			'X-Player-Id': credentials.playerId,
			'X-Player-Token': credentials.playerToken,
		} : {},
	})

	return parseResponse(response)
}


export async function joinGame(gameId, color, name, adminToken) {
	const response = await fetch(`${API_BASE}/games/${gameId}/join`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ color, name, adminToken })
	})

	return parseResponse(response)
}


export async function quitGame(gameId, credentials) {
	const response = await fetch(`${API_BASE}/games/${gameId}/quit`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(credentials)
	})

	return parseResponse(response)
}


export async function restartGame(gameId, credentials) {
	const response = await fetch(`${API_BASE}/games/${gameId}/restart`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(credentials)
	})

	return parseResponse(response)
}


export function gameSocketUrl(gameId, credentials) {
	const params = new URLSearchParams({
		playerId: credentials.playerId,
		token: credentials.playerToken
	})

	return `${WS_BASE}/games/${gameId}/ws?${params.toString()}`
}


async function lobbyRequest(gameId, action, credentials, changes = {}, method = 'POST') {
	const response = await fetch(`${API_BASE}/games/${gameId}/${action}`, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			...changes,
			playerId: credentials.playerId,
			playerToken: credentials.playerToken,
		}),
	})
	return parseResponse(response)
}

export const updateLobbyProfile = (gameId, credentials, changes) =>
	lobbyRequest(gameId, 'profile', credentials, changes, 'PATCH')

export const updateLobbySettings = (gameId, credentials, settings) =>
	lobbyRequest(gameId, 'settings', credentials, settings, 'PATCH')

export const startLobbyGame = (gameId, credentials) =>
	lobbyRequest(gameId, 'start', credentials)

export const leaveLobby = (gameId, credentials) =>
	lobbyRequest(gameId, 'leave-room', credentials)

export const addLobbyBot = (gameId, credentials) =>
	lobbyRequest(gameId, 'bots', credentials)

export const removeLobbyPlayer = (gameId, credentials, targetPlayerId) =>
	lobbyRequest(gameId, 'remove-player', credentials, { targetPlayerId })
