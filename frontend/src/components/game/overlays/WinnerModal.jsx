import clsx from 'clsx'
import { getPlayerColorHex } from '../../../game/playerColors'

function WinnerModal({ isOpen, isTie, leaderboard, onClose, resultColor, winner }) {
	if (!isOpen) return null

	return (
		<div className="modalBackdrop">
			<div
				className="winnerModal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="winner-title"
			>
				<button
					className="modalCloseButton"
					onClick={onClose}
					aria-label="Close winner summary"
				>
					<svg aria-hidden="true" viewBox="0 0 24 24">
						<path d="M18 6 6 18" />
						<path d="m6 6 12 12" />
					</svg>
				</button>

				<div
					className="winnerBadge"
					style={{ '--winner-color': resultColor }}
				>
					<svg aria-hidden="true" viewBox="0 0 24 24">
						<path d="M6 9 8 20h8l2-11-4 3-2-6-2 6-4-3Z" />
						<path d="M8 20h8" />
					</svg>
				</div>

				<div id="winner-title" className="winnerTitle">
					{isTie ? 'It\'s a tie!' : `${winner?.name || 'A player'} won!`}
				</div>

				<div className="leaderboardList">
					{leaderboard.map(entry => (
						<div
							key={entry.playerId}
							className={clsx(
								'leaderboardRow',
								isTie && entry.rank === 1 && 'leaderboardTiedLeader',
							)}
							style={{ '--leader-color': getPlayerColorHex(entry.color) }}
						>
							<div className="leaderboardRank">
								{entry.rank}
							</div>

							<div className="leaderboardName">
								{entry.name}
								{isTie && entry.rank === 1 && <em className="tieLabel">Tied</em>}
							</div>

							<div className="leaderboardBlocks">
								{entry.blocksPlaced} blocks
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

export default WinnerModal
