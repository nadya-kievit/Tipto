import { getPlayerColorHex } from '../../game/playerColors'
import { previewPlacements } from '../../game/previewPlacements'

function BoardPreview({ board, players, selected }) {
	const pieces = new Map()
	if (selected) {
		previewPlacements(board, players.length).forEach((cells, index) => {
			const color = getPlayerColorHex(players[index].color)
			for (const [row, col] of cells) pieces.set(`${row}-${col}`, color)
		})
	}
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
