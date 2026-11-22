import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Bot } from 'lucide-react'
import { getPlayerColorHex } from '../playerColors'
import Piece from './Piece'

function PlayerRank({ currentUserId, game, portraitComputer }) {
	const [page, setPage] = useState(0)

	const playerProgress = useMemo(() => game.players
		.map((player, originalIndex) => ({
			player, originalIndex,
			placedBlocks: player.pieces.reduce((total, piece) => total + (piece.placed ? piece.cells.length : 0), 0),
			left: player.pieces.filter(piece => !piece.placed).length,
		}))
		.sort((a, b) => b.placedBlocks - a.placedBlocks), [game.players])
	
	const hasPages = portraitComputer && playerProgress.length > 3
	const pageStart = hasPages ? Math.min(page * 3, playerProgress.length - 3) : 0
	const visiblePlayers = portraitComputer 
		? playerProgress.slice(pageStart, pageStart + 3) 
		: playerProgress

	return (
		<div className="playerRankPanel">
			
			<h2 className="gamePanelTitle">Players</h2>

			<div className={`playerPager${hasPages ? ' hasPages' : ''}`}>
				{hasPages && 
					<button 
						type="button" 
						className="playerPageArrow" 
						disabled={pageStart === 0} 
						onClick={() => setPage(0)}
					>
						‹
					</button>
				}
			
				<div className="playerPanelGrid">
					{visiblePlayers.map(({ player, placedBlocks, left }) => {
						const isYou = player.id === currentUserId
						const isActive = player.id === game.currentPlayerId
						const total = player.pieces.length
						const canView = !isYou
						const placed = total - left

						return (
							<div
								key={player.id}
								className={clsx('playerStatusCard', {
									playerStatusActive: isActive,
								})}
								style={{ '--player-color': getPlayerColorHex(player.color) }}
							>
								<span className="playerStatusColor">
									{player.isBot && <Bot />}
								</span>

								<span className="playerStatusName" title={player.name}>
									{player.name}{isYou ? <small> (you)</small> : ''}
								</span>

								<span className="playerPiecePips">
									{Array.from({ length: total }, (_, index) => 
										<i key={index} className={index < placed ? 'placed' : ''} />
									)}
								</span>

								<span className="playerStatusBlocks" title="Blocks placed">
									{placedBlocks}<small>pts</small>
								</span>

								<div className="playerPiecesProgress">
									<span style={{ width: `${left / total * 100}%` }} />
								</div>

								<div className="playerStatusBody">
									<span className="playerPiecesLeft">
										{left}/{total}
									</span>

									{canView && 
										<button 
											type="button" 
											className="viewPiecesButton" 
											popoverTarget={`pieces-${player.id}`}
										>
											<span className="showPiecesLabel">Pieces</span>
											<span className="hidePiecesLabel">Hide</span>
										</button>}
								</div>

								{canView &&
									<div id={`pieces-${player.id}`} className="playerPiecesPopover" popover="auto">
										{player.pieces.filter(piece => !piece.placed).map(piece => 
											<Piece 
												key={piece.name} 
												piece={piece}
												color={player.color} 
												cellSize={8} 
												staticPreview 
											/>
										)}
								</div>}
							</div>
						)
					})}
				</div>

				{hasPages && 
					<button 
						type="button" 
						className="playerPageArrow" 
						disabled={pageStart === playerProgress.length - 3} 
						onClick={() => setPage(1)}
					>
						›
					</button>
				}
			</div>
		</div>
	)
}

export default PlayerRank
