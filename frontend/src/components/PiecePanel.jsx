import { getPlayerColorHex } from '../playerColors'
import { tileFinish } from '../game/piecePresentation'
import Piece from './Piece'

function MouseIcon({ action }) {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			{action === 'flip' && <path className="controlHighlight" d="M12 3h1a6 6 0 0 1 6 6v3h-7Z" />}
			<rect x="5" y="3" width="14" height="18" rx="5" />
			<path d="M5 12h14M12 3v9" />
			{action === 'rotate' && <rect className="controlHighlight" x="10.5" y="6" width="3" height="5" rx="1" />}
		</svg>
	)
}

function PiecePanel({
	canMove, isWaitingForPlayers, onPieceClick, pieces, playablePieceNames,
	player, selectedPieceName, totalPieceCount, selectedPiece, pieceCellSize = 13,
}) {
	const left = pieces.filter(piece => !piece.placed).length
	const ability = selectedPiece?.ability
	const firstMove = !player?.pieces.some(piece => piece.placed)
	return (
		<aside className="piecesRight" aria-label="Your pieces">
			<div className="piecePanelHeader">
				<h2 className="gamePanelTitle">Your pieces</h2>
				<span className="pieceCount">{left}/{totalPieceCount}</span>
			</div>
			<div data-game-piece className="pieceCardGrid">
				{pieces.map(piece => <Piece key={piece.name} piece={piece} isWaitingForPlayers={isWaitingForPlayers}
					color={player?.color} isSelected={selectedPieceName === piece.name}
					isPlayable={playablePieceNames.has(piece.name)} disabled={!canMove}
					onClick={event => onPieceClick(piece, event)} rotation={piece.rotation} flipped={piece.flipped} cellSize={pieceCellSize} />)}
			</div>
			{firstMove ? <div className="pieceAbilityCard firstMoveCard" data-game-piece>
				<div className="firstMoveSwatch" style={{ '--start-color': getPlayerColorHex(player?.color) }} aria-hidden="true"><i /></div>
				<div><div className="abilityTitle">First move</div><p>Pick any piece and place it so it covers your starting square, outlined in white on the board.</p></div>
			</div> : ability && <div className="pieceAbilityCard" data-game-piece>
				<div className="abilitySwatch" aria-hidden="true">
					{Array.from({ length: 4 }, (_, index) => <i key={index} style={tileFinish(getPlayerColorHex(player?.color), ability, 'tray')} />)}
				</div>
				<div>
					<div className="abilityTitle">{ability === 'scout' ? 'Scout' : 'Connector'}</div>
					<div className="abilityLabel">Special piece</div>
					<p>{ability === 'scout'
						? 'Ignores the corner rule. Place it anywhere it fits, even without touching your other pieces.'
						: 'Ignores the edge rule. It can touch your own pieces along an edge as well as at a corner.'}</p>
				</div>
			</div>}
			<div className="pieceControls">
				<h3>Controls</h3>
				<div className="pieceControlRow"><span><MouseIcon action="rotate" />Rotate</span><span className="controlKeys"><kbd>Scroll</kbd><span>or</span><kbd>← →</kbd></span></div>
				<div className="pieceControlRow"><span><MouseIcon action="flip" />Flip</span><span className="controlKeys"><kbd>Right-click</kbd><span>or</span><kbd>↑ ↓</kbd></span></div>
				<div className="pieceControlRow"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>Put back</span><kbd>Esc</kbd></div>
			</div>
		</aside>
	)
}

export default PiecePanel
