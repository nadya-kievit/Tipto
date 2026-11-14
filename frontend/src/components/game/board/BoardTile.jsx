import { createElement } from 'react'

// Used by placed cells, hover cells and both pointer previews.
export default function BoardTile({ as = 'div', color, ability, occupied = true,
	playable = true, startColor, lastMoveEdges, className = '', style, ...props }) {
	return createElement(as, { ...props, className: `gameBoardTile ${className}`,
		'data-occupied': occupied, 'data-playable': playable, 'data-start': Boolean(startColor && !occupied),
		'data-ability': ability || 'normal',
		style: {
			'--tile-color': color, '--tile-start-color': startColor,
			'--tile-edge-top': Number(Boolean(lastMoveEdges?.top)),
			'--tile-edge-right': Number(Boolean(lastMoveEdges?.right)),
			'--tile-edge-bottom': Number(Boolean(lastMoveEdges?.bottom)),
			'--tile-edge-left': Number(Boolean(lastMoveEdges?.left)),
			...style,
		} })
}
