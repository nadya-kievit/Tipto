import clsx from 'clsx'
import { getPlayerColorHex } from '../playerColors'
import { displayCells } from './piecePresentation'

function Piece({piece, isSelected, isPlayable = true, disabled = false, onClick, rotation = 0, flipped = false, color, cellSize, staticPreview = false}) {
	const cells = displayCells(piece.cells, rotation, flipped)
	const rows = Math.max(...cells.map(([row]) => row)) + 1
	const columns = Math.max(...cells.map(([, col]) => col)) + 1

	const className = clsx('pieceCard', {
		selected: isSelected,
		placed: piece.placed,
	})

	return (<>
		{staticPreview ? 
			<div className={className} data-piece-name={piece.name} data-ability={piece.ability || 'normal'}>
				<span className="pieceShape" data-ability={piece.ability || 'normal'} data-finish="list" style={{
					'--piece-color': getPlayerColorHex(color),
					'--piece-columns': columns,
					'--piece-rows': rows,
					'--piece-max-cell-size': `${cellSize}px`,
				}}>
					{cells.map(([row, col]) => <i key={`${row},${col}`} className="pieceFinishTile" style={{
						gridRow: row + 1, gridColumn: col + 1,
					}} />)}
				</span>
			</div>
		:
			<button 
				type="button" 
				className={className} 
				disabled={disabled || piece.placed || !isPlayable}
				onClick={onClick}
				aria-pressed={Boolean(isSelected)} data-piece-name={piece.name} data-ability={piece.ability || 'normal'}
				data-rotation={rotation} data-flipped={flipped}
			>
				<span className="pieceShape" data-ability={piece.ability || 'normal'} style={{
					'--piece-color': getPlayerColorHex(color),
					'--piece-columns': columns,
					'--piece-rows': rows,
					'--piece-max-cell-size': `${cellSize}px`,
				}}>
					{cells.map(([row, col]) => <i key={`${row},${col}`} className="pieceFinishTile" style={{
						gridRow: row + 1, gridColumn: col + 1,
					}} />)}
				</span>
			</button>
		}
	</>)
}

export default Piece
