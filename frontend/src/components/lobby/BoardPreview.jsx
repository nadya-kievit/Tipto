import { getPlayerColorHex } from '../../game/playerColors'
import { previewPlacements } from '../../game/previewPlacements'

const BOARDS = [
	{
		id: 'square',
		label: 'Classic',
		shape: ['#######', '#######', '#######', '#######', '#######', '#######', '#######'],
	},
	{
		id: 'irregular',
		label: 'Irregular',
		shape: ['..###..', '.#####.', '#######', '#######', '.#####.', '..####.', '...##..'],
	},
	{
		id: 'rooms',
		label: 'Rooms',
		shape: ['###.###', '###.###', '.#...#.', '.#####.', '...#...', '..###..', '..###..'],
	},
]

function BoardShape({ board, players, selected }) {
	const pieces = new Map()
	if (selected) {
		previewPlacements(board, players.length).forEach((cells, index) => {
			const color = getPlayerColorHex(players[index].color)
			for (const [row, col] of cells) pieces.set(`${row}-${col}`, color)
		})
	}
	return (
		<span className="lobbyBoardPreview">
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

function BoardPreview({ boardLayout, players, disabled, onChange }) {
	return (
		<div className="lobbyBoardCards" role="group">
			{BOARDS.map(board => {
				const selected = boardLayout === board.id
				return (
					<button
						type="button"
						key={board.id}
						className={selected ? 'selected' : ''}
						disabled={disabled}
						onClick={() => onChange(board.id)}
					>
						<BoardShape board={board} players={players} selected={selected} />
						<span>{board.label}</span>
					</button>
				)
			})}
		</div>
	)
}

export default BoardPreview
