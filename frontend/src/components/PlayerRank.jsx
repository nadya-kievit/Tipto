import { useMemo, useState } from 'react'
import { getPlayerColorHex } from '../playerColors'
import Piece from './Piece'

function PlayerRank({ currentUserId, game, pieceCellSize = 7 }) {
	const [expandedPlayerId, setExpandedPlayerId] = useState(null)
	const playerProgress = useMemo(() => Object.keys(game?.settings?.players || {})
		.map((playerKey, originalIndex) => {
			const player = game.players.find(player => player.settingsPlayerKey === playerKey)
			return {
				player, playerKey, originalIndex,
				placedBlocks: (player?.pieces || []).reduce((total, piece) => total + (piece.placed ? piece.cells.length : 0), 0),
				left: (player?.pieces || []).filter(piece => !piece.placed).length,
			}
		}).sort((a, b) => b.placedBlocks - a.placedBlocks || a.originalIndex - b.originalIndex), [game])
	return (
		<aside className="playerRankPanel" aria-label="Players">
			<h2 className="gamePanelTitle">Players</h2>
			<div className="playerPanelGrid">
				{playerProgress.map(({ player, playerKey, placedBlocks, left }) => {
					const isYou = player?.id === currentUserId
					const expanded = player?.id === expandedPlayerId
					const total = player?.pieces.length || 16
					const canView = player && !isYou
					return (
						<div key={player?.id || playerKey} className={`playerStatusCard${player?.id === game.currentPlayerId ? ' playerStatusActive' : ''}`}
							style={{ '--player-color': getPlayerColorHex(player?.color) }}>
							<div className="playerStatusHeader">
								<span className="playerStatusColor" aria-hidden="true" />
								<span className="playerStatusName" title={player?.name}>{player?.name || playerKey}{isYou ? ' (you)' : ''}</span>
								<span className="playerStatusBlocks" title="Blocks placed">{placedBlocks}</span>
							</div>
							<div className="playerPiecesProgress" aria-label={`${left} of ${total} pieces left`}><span style={{ width: `${left / total * 100}%` }} /></div>
							<div className="playerStatusBody">
								<span className="playerPiecesLeft">{left}/{total}</span>
								{canView && <button type="button" className="viewPiecesButton" aria-expanded={expanded}
									onClick={() => setExpandedPlayerId(current => current === player.id ? null : player.id)}>
									{expanded ? 'Hide' : 'Pieces'}
								</button>}
							</div>
							{expanded && <div className="playerRemainingPieces">
								{player.pieces.map(piece => <Piece key={piece.name} piece={piece} placed={piece.placed}
									color={player.color} cellSize={pieceCellSize} staticPreview />)}
							</div>}
						</div>
					)
				})}
			</div>
		</aside>
	)
}

export default PlayerRank
