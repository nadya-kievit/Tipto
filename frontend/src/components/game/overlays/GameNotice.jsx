function GameNotice({ message, onDismiss }) {
	if (!message) return null

	return (
		<div className="gameNotice" role="status">
			<span>{message}</span>
			<button type="button" onClick={onDismiss} aria-label="Dismiss message">Dismiss</button>
		</div>
	)
}

export default GameNotice
