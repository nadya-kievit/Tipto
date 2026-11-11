import { createElement } from 'react'
import { tileFinish } from '../../../game/piecePresentation'

// Used by placed cells, hover cells and both pointer previews.
export default function BoardTile({ as = 'div', metrics, color, ability, occupied = true,
	playable = true, startColor, lastMoveEdges, className = '', style, ...props }) {
	const finish = occupied ? tileFinish(color, ability, 'board', false, metrics)
		: { background: playable ? 'var(--cell)' : 'color-mix(in srgb, var(--cell) 10%, var(--surface))', boxShadow: 'none' }
	if (startColor && !occupied) {
		finish.background = `color-mix(in srgb, ${startColor} 28%, var(--cell))`
		finish.boxShadow = `inset 0 0 0 ${metrics.edge}px ${startColor}`
	}
	if (lastMoveEdges) {
		const highlight = `color-mix(in srgb, ${color} 45%, #fff)`
		const edges = []
		if (lastMoveEdges.top) edges.push(`inset 0 ${metrics.edge}px 0 0 ${highlight}`)
		if (lastMoveEdges.right) edges.push(`inset -${metrics.edge}px 0 0 0 ${highlight}`)
		if (lastMoveEdges.bottom) edges.push(`inset 0 -${metrics.edge}px 0 0 ${highlight}`)
		if (lastMoveEdges.left) edges.push(`inset ${metrics.edge}px 0 0 0 ${highlight}`)
		if (edges.length) finish.boxShadow = [...edges, ...(finish.boxShadow === 'none' ? [] : [finish.boxShadow])].join(', ')
	}
	return createElement(as, { ...props, className: `gameBoardTile ${className}`,
		style: { width: metrics.cell, height: metrics.cell, borderRadius: metrics.radius, ...finish, ...style } })
}
