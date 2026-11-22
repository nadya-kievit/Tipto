import clsx from 'clsx'
import { Crown, X } from 'lucide-react'
import { getPlayerColorHex } from '../playerColors'

function WinnerModal({ isOpen, isTie, leaderboard, onClose, resultColor, winner }) {
	if (!isOpen) return null

	return (
		<div className="modalBackdrop">
			<div
				className="winnerModal"
				role="dialog"
				aria-modal="true"
			>
				<button className="modalCloseButton" onClick={onClose}>
					<X />
				</button>

				<div className="winnerBadge" style={{ '--winner-color': resultColor }}>
					<Crown/>
				</div>

				<div className="winnerTitle">
					{isTie ? 'It\'s a tie!' : `${winner?.name} won!`}
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
