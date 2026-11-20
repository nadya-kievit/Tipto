import { getPlayerColorHex } from '../../../game/playerColors'
import { displayCells, tileFinish } from '../../../game/piecePresentation'

function Piece({
	piece, isWaitingForPlayers, placed = piece.placed, isSelected, isPlayable = true,
	disabled = false, onClick, rotation = 0, flipped = false, color, cellSize = 12,
	staticPreview = false,
}) {
	const cells = displayCells(piece.cells, rotation, flipped)
	const rows = Math.max(...cells.map(([row]) => row)) + 1
	const columns = Math.max(...cells.map(([, col]) => col)) + 1
	const context = staticPreview ? 'list' : 'tray'
	const finish = tileFinish(getPlayerColorHex(color), piece.ability, context)
	const tooltip = piece.ability === 'scout'
		? 'Scout — place without a connection; no shared edges. First move must cover your starting square.'
		: piece.ability === 'connector'
			? 'Connector — connect along edges or corners. First move must cover your starting square.'
			: piece.name
	const content = (
		<span className="pieceShape" style={{
			'--piece-columns': columns,
			'--piece-rows': rows,
			'--piece-max-cell-size': `${cellSize}px`,
		}}>
			{cells.map(([row, col]) => <i key={`${row},${col}`} className="pieceFinishTile" style={{
				gridRow: row + 1, gridColumn: col + 1, ...finish,
			}} />)}
		</span>
	)
	const className = `pieceCard${isSelected ? ' selected' : ''}${placed ? ' placed' : ''}`
	if (staticPreview) {
		return <div className={className} title={tooltip}
			data-piece-name={piece.name} data-ability={piece.ability || 'normal'}>{content}</div>
	}
	return (
		<button type="button" className={className} disabled={disabled || isWaitingForPlayers || placed || !isPlayable}
			onClick={onClick} title={tooltip}
			aria-pressed={Boolean(isSelected)} data-piece-name={piece.name} data-ability={piece.ability || 'normal'}
			data-rotation={rotation} data-flipped={flipped}>
			{content}
		</button>
	)
}

export default Piece
