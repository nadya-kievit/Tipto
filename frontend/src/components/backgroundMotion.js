const EPSILON = 1e-6

export function advanceAxis(position, velocity, seconds, limit) {
	if (limit <= 0) return { position: 0, velocity }
	const next = position + velocity * seconds
	const phase = ((next % (2 * limit)) + 2 * limit) % (2 * limit)
	return {
		position: phase <= limit ? phase : 2 * limit - phase,
		velocity: phase === 0 ? Math.abs(velocity)
			: phase === limit ? -Math.abs(velocity)
				: phase < limit ? velocity : -velocity,
	}
}

// Match CSS rotation about the centre of the unrotated grid. Only occupied
// squares participate; holes and empty corners have no collision surface.
export function pieceGeometry(piece) {
	const angle = (piece.rotation || 0) * Math.PI / 180
	const cos = Math.cos(angle)
	const sin = Math.sin(angle)
	const cells = piece.cells || [{ x: 0, y: 0, width: piece.width, height: piece.height }]
	const tiles = cells.map(cell => {
		const dx = cell.x + cell.width / 2 - piece.width / 2
		const dy = cell.y + cell.height / 2 - piece.height / 2
		return {
			x: piece.x + piece.width / 2 + dx * cos - dy * sin,
			y: piece.y + piece.height / 2 + dx * sin + dy * cos,
			hw: cell.width / 2, hh: cell.height / 2,
			ux: cos, uy: sin, vx: -sin, vy: cos,
		}
	})
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
	for (const tile of tiles) {
		const ex = Math.abs(cos) * tile.hw + Math.abs(sin) * tile.hh
		const ey = Math.abs(sin) * tile.hw + Math.abs(cos) * tile.hh
		minX = Math.min(minX, tile.x - ex)
		maxX = Math.max(maxX, tile.x + ex)
		minY = Math.min(minY, tile.y - ey)
		maxY = Math.max(maxY, tile.y + ey)
	}
	return { tiles, minX, minY, maxX, maxY }
}

function tileContact(a, b) {
	let contact = null
	for (const [nx, ny] of [[a.ux, a.uy], [a.vx, a.vy], [b.ux, b.uy], [b.vx, b.vy]]) {
		const distance = (a.x - b.x) * nx + (a.y - b.y) * ny
		const reachA = a.hw * Math.abs(a.ux * nx + a.uy * ny) + a.hh * Math.abs(a.vx * nx + a.vy * ny)
		const reachB = b.hw * Math.abs(b.ux * nx + b.uy * ny) + b.hh * Math.abs(b.vx * nx + b.vy * ny)
		const depth = reachA + reachB - Math.abs(distance)
		if (depth <= EPSILON) return null
		if (!contact || depth < contact.depth) {
			const sign = distance < 0 ? -1 : 1
			contact = { nx: nx * sign, ny: ny * sign, depth }
		}
	}
	return contact
}

function geometryContact(a, b) {
	// Cheap bounds check first, then precise separating-axis tests on the tiles.
	if (a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY) return null
	let contact = null
	for (const tileA of a.tiles) {
		for (const tileB of b.tiles) {
			const next = tileContact(tileA, tileB)
			if (next && (!contact || next.depth < contact.depth)) contact = next
		}
	}
	return contact
}

export function piecesOverlap(a, b) {
	return Boolean(geometryContact(pieceGeometry(a), pieceGeometry(b)))
}

function boundaryContact(geometry, width, height) {
	if (geometry.minX < -EPSILON) return { nx: 1, ny: 0 }
	if (geometry.maxX > width + EPSILON) return { nx: -1, ny: 0 }
	if (geometry.minY < -EPSILON) return { nx: 0, ny: 1 }
	if (geometry.maxY > height + EPSILON) return { nx: 0, ny: -1 }
	return null
}

export function arrangePieces(pieces, width, height) {
	const placed = []
	for (const piece of [...pieces].sort((a, b) => b.width * b.height - a.width * a.height)) {
		piece.active = false
		const local = pieceGeometry({ ...piece, x: 0, y: 0 })
		const minX = -local.minX, maxX = width - local.maxX
		const minY = -local.minY, maxY = height - local.maxY
		if (minX > maxX || minY > maxY) continue
		const startX = Math.max(minX, Math.min(piece.x, maxX))
		const startY = Math.max(minY, Math.min(piece.y, maxY))
		const xs = new Set([startX, minX, maxX])
		const ys = new Set([startY, minY, maxY])
		for (const other of placed) {
			xs.add(other.maxX - local.minX + 1)
			xs.add(other.minX - local.maxX - 1)
			ys.add(other.maxY - local.minY + 1)
			ys.add(other.minY - local.maxY - 1)
		}
		let best = null, bestDistance = Infinity
		for (const x of xs) {
			if (x < minX || x > maxX) continue
			for (const y of ys) {
				if (y < minY || y > maxY) continue
				const distance = (x - startX) ** 2 + (y - startY) ** 2
				if (distance >= bestDistance) continue
				const geometry = pieceGeometry({ ...piece, x, y })
				if (placed.some(other => geometryContact(geometry, other))) continue
				best = { x, y, geometry }
				bestDistance = distance
			}
		}
		// Preserve original tile size; excess decorations can return on resize.
		if (!best) continue
		piece.x = best.x
		piece.y = best.y
		piece.active = true
		placed.push(best.geometry)
	}
}

function reflect(piece, nx, ny) {
	const toward = piece.vx * nx + piece.vy * ny
	if (toward < 0) {
		piece.vx -= 2 * toward * nx
		piece.vy -= 2 * toward * ny
	}
}

export function advancePieces(pieces, seconds, width, height) {
	if (seconds <= 0) return
	const active = pieces.filter(piece => piece.active)
	const maxSpeed = Math.max(0, ...active.map(piece => Math.hypot(piece.vx, piece.vy)))
	const steps = Math.max(1, Math.ceil(maxSpeed * seconds / 2))
	const dt = seconds / steps
	const geometries = active.map(pieceGeometry)
	for (let step = 0; step < steps; step++) {
		for (let index = 0; index < active.length; index++) {
			const piece = active[index]
			const start = { x: piece.x, y: piece.y }
			const geometryAt = fraction => pieceGeometry({ ...piece,
				x: start.x + piece.vx * dt * fraction,
				y: start.y + piece.vy * dt * fraction,
			})
			const findContact = geometry => {
				const edge = boundaryContact(geometry, width, height)
				if (edge) return edge
				for (let other = 0; other < active.length; other++) {
					if (other === index) continue
					const contact = geometryContact(geometry, geometries[other])
					if (contact) return { ...contact, other }
				}
				return null
			}
			const targetGeometry = geometryAt(1)
			const contact = findContact(targetGeometry)
			let fraction = 1
			if (contact) {
				// Approach actual contact instead of bouncing a full frame early.
				let low = 0, high = 1
				for (let search = 0; search < 12; search++) {
					const mid = (low + high) / 2
					if (findContact(geometryAt(mid))) high = mid
					else low = mid
				}
				fraction = low
			}
			piece.x = start.x + piece.vx * dt * fraction
			piece.y = start.y + piece.vy * dt * fraction
			geometries[index] = contact ? pieceGeometry(piece) : targetGeometry
			if (contact) {
				reflect(piece, contact.nx, contact.ny)
				if (contact.other !== undefined) {
					reflect(active[contact.other], -contact.nx, -contact.ny)
				}
			}
		}
	}
}
