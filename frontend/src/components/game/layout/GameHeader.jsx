function GameHeader({ gameId, isQuitting, onCopyInvite, onQuit, children }) {
	return (
		<header className="gameHeader">
			<h1 className="gameHeaderTitle">
				<span className="gameLogoMark" aria-hidden="true"><i /><i /><i /></span>
				Tipto
			</h1>
			{children}
			<div className="gameActions">
				<div className="headerCode">Room <strong>{gameId}</strong></div>
				<button type="button" className="gameCopyButton" onClick={onCopyInvite} aria-label="Copy room code" title="Copy room code">
					<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M16 8V4H4v12h4" /></svg>
				</button>
				<button type="button" className="gameLeaveButton" onClick={onQuit} disabled={isQuitting}>
					{isQuitting ? 'Leaving…' : 'Leave'}
				</button>
			</div>
		</header>
	)
}

export default GameHeader
