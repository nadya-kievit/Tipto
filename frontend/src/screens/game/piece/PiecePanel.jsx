import clsx from 'clsx'
import { X } from 'lucide-react'
import { getPlayerColorHex } from '../../playerColors'
import Piece from './Piece'

const ABILITY_INSTRUCTIONS = {
	scout: {
		title: 'Scout',
		message: 'Place it without a corner connection, but never along an edge of your own pieces.',
	},
	connector: {
		title: 'Connector',
		message: 'It must touch one of your pieces along an edge or at a corner.',
	},
}

function MouseIcon({ action }) {
	return (
		<svg viewBox="0 0 24 24">
			{action === 'flip' && <path className="controlHighlight" d="M12 3h1a6 6 0 0 1 6 6v3h-7Z" />}
			<rect x="5" y="3" width="14" height="18" rx="5" />
			<path d="M5 12h14M12 3v9" />
			{action === 'rotate' && <rect className="controlHighlight" x="10.5" y="6" width="3" height="5" rx="1" />}
		</svg>
	)
}

function PiecePanel({canMove, onPieceClick, pieces, playablePieceNames, player, selectedPieceName, selectedPiece, pieceCellSize}) {
	const playerColor = getPlayerColorHex(player?.color)
	const left = pieces.filter(piece => !piece.placed).length
	const ability = selectedPiece?.ability

	let instruction

	if (left === pieces.length) {
		instruction = {
			title: 'First move',
			message: 'Pick any piece and place it so it covers your starting square, outlined in your color on the board.',
		}
	} else if (ability) {
		const copy = ability === 'scout' ? ABILITY_INSTRUCTIONS.scout : ABILITY_INSTRUCTIONS.connector
		instruction = {
			title: copy.title,
			message: copy.message,
			label: 'Special piece',
		}
	} else {
		instruction = {
			title: 'Your turn',
			message: 'Pick a piece and place it so it touches one of your pieces at a corner.',
		}
	}

	return (
		<div className="piecesRight" style={{ '--player-color': playerColor }}>
			<div className="piecePanelHeader">
				<h1 className="gamePanelTitle">Your pieces</h1>
				<span className="pieceCount">{left}/{pieces.length}</span>
			</div>

			<div className="piecesBody">
				<div className="pieceCardGrid">
					{pieces.map(piece => 
						<Piece 
							key={piece.name} 
							piece={piece}
							color={playerColor} 
							isSelected={selectedPieceName === piece.name}
							isPlayable={playablePieceNames.has(piece.name)} 
							disabled={!canMove}
							onClick={event => onPieceClick(piece, event)} 
							rotation={piece.rotation} 
							flipped={piece.flipped} 
							cellSize={pieceCellSize} 
						/>
					)}
				</div>

				<div className="piecePanelAside">
					<div className="pieceAbilityCard">
						<h2>{instruction.title}</h2>
						{instruction.label && 
							<div className="abilityLabel">
								{instruction.label}
							</div>
						}
						<p>{instruction.message}</p>
					</div>
					<div className="pieceControls">
						<h3>Controls</h3>
						<div className="pieceControlRow"><span><MouseIcon action="rotate" />Rotate</span><span className="controlKeys"><kbd>Scroll</kbd><span>or</span><kbd>← →</kbd></span></div>
						<div className="pieceControlRow"><span><MouseIcon action="flip" />Flip</span><span className="controlKeys"><kbd>Right-click</kbd><span>or</span><kbd>↑ ↓</kbd></span></div>
						<div className="pieceControlRow"><span><X />Put back</span><kbd>Esc</kbd></div>
					</div>
				</div>
			</div>
		</div>
	)
}

export default PiecePanel
