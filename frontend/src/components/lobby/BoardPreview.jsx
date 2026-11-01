import { getPlayerColorHex } from '../../game/playerColors'

const L_SHAPES = [
	[[0, 0], [1, 0], [1, 1]],
	[[0, 0], [0, 1], [1, 0]],
	[[0, 0], [0, 1], [1, 1]],
	[[0, 1], [1, 0], [1, 1]],
]

function previewPieces(board, players) {
	const occupied = new Set()
	const result = new Map()
	for (const player of players) {
		let best = null
		for (const shape of L_SHAPES) {
			for (let row = 0; row < 7; row++) {
				for (let col = 0; col < 7; col++) {
					const cells = shape.map(([dr, dc]) => [row + dr, col + dc])
					if (cells.some(([r, c]) => r > 6 || c > 6 || board.shape[r][c] !== '#' || occupied.has(`${r}-${c}`))) continue
					const centre = cells.reduce((sum, [r, c]) => sum + (r - 3) ** 2 + (c - 3) ** 2, 0)
					const distances = cells.flatMap(([r, c]) => [...occupied].map(key => {
						const [or, oc] = key.split('-').map(Number)
						return (r - or) ** 2 + (c - oc) ** 2
					}))
					const nearest = distances.length ? Math.min(...distances) : centre
					const total = distances.length ? distances.reduce((sum, distance) => sum + distance, 0) : centre
					if (!best || nearest > best.nearest || nearest === best.nearest && total > best.total) {
						best = {
							cells,
							nearest,
							total
						}
					}
				}
			}
		}
		if (best) {
			for (const [row, col] of best.cells) {
				const key = `${row}-${col}`
				occupied.add(key)
				result.set(key, getPlayerColorHex(player.color))
			}
		}
	}
	return result
}

function BoardPreview({ board, players, selected }) {
	const pieces = selected ? previewPieces(board, players) : new Map()
	return (
		<span className="lobbyBoardPreview" aria-hidden="true">
			{board.shape.flatMap((row, r) => [...row].map((cell, c) => {
				const color = pieces.get(`${r}-${c}`)
				return (
					<i
						key={`${r}-${c}`}
						className={cell === '#' ? 'playable' : ''}
						style={color ? {
							'--preview-player': color
						} : undefined}
						data-sample={color ? '' : undefined}
					/>
				)
			}))}
		</span>
	)
}

export default BoardPreview
