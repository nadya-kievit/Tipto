import { useMemo, useState } from 'react'
import { getPlayerColorHex } from '../playerColors'
import Piece from './Piece'

function RobotIcon() {
	return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4v4M9 13v1M15 13v1M9.5 17h5" /><circle cx="12" cy="3.5" r="1" /></svg>
}

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
			<div className="playerPanelHeader"><h2 className="gamePanelTitle">Players</h2></div>
			<div className="playerPanelGrid">
				{playerProgress.map(({ player, playerKey, placedBlocks, left }) => {
					const isYou = player?.id === currentUserId
					const expanded = player?.id === expandedPlayerId
					const total = player?.pieces.length || 16
					const canView = player && !isYou
					return (
						<div key={player?.id || playerKey} className={`playerStatusCard${player?.id === game.currentPlayerId ? ' playerStatusActive' : ''}`}
							style={{ '--player-color': getPlayerColorHex(player?.color) }}>
							<span className="playerStatusColor" aria-hidden="true">{player?.isBot && <RobotIcon />}</span>
							<span className="playerStatusName" title={player?.name}>{player?.name || playerKey}{isYou ? <small> (you)</small> : ''}</span>
							<span className="playerStatusBlocks" title="Blocks placed">{placedBlocks}<small>pts</small></span>
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
