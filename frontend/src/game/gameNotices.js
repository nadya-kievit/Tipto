export function getNewGameNotice(previousNotice, nextNotice) {
	if (!nextNotice || nextNotice === previousNotice) return ''
	if (nextNotice.startsWith('Game over.')) return ''
	if (nextNotice.endsWith(' goes first.')) return ''
	return nextNotice
}
