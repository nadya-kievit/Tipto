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
	const tooltip = piece.ability === 'scout'
		? 'Scout — place without a connection; no shared edges. First move must cover your starting square.'
		: piece.ability === 'connector'
			? 'Connector — connect along edges or corners. First move must cover your starting square.'
			: piece.name
	const content = (
		<span className="pieceShape" aria-hidden="true" style={{
			width: columns * cellSize + columns - 1,
			height: rows * cellSize + rows - 1,
		}}>
			{cells.map(([row, col], index) => <i key={index} className="pieceFinishTile" style={{
				width: cellSize, height: cellSize,
				top: row * (cellSize + 1), left: col * (cellSize + 1),
				...tileFinish(getPlayerColorHex(color), piece.ability, context),
			}} />)}
		</span>
	)
	const className = `pieceCard${isSelected ? ' selected' : ''}${placed ? ' placed' : ''}`
	if (staticPreview) {
		return <div className={className} title={tooltip} aria-label={`${piece.name}${placed ? ' — used' : ''}`}
			data-piece-name={piece.name} data-ability={piece.ability || 'normal'}>{content}</div>
	}
	return (
		<button type="button" className={className} disabled={disabled || isWaitingForPlayers || placed || !isPlayable}
			onClick={onClick} title={tooltip} aria-label={`${piece.name}${piece.ability ? ` — ${piece.ability}` : ''}${placed ? ' — used' : ''}`}
			aria-pressed={Boolean(isSelected)} data-piece-name={piece.name} data-ability={piece.ability || 'normal'}
			data-rotation={rotation} data-flipped={flipped}>
			{content}
		</button>
	)
}

export default Piece
