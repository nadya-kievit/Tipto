import { useEffect, useMemo, useRef, useState } from 'react'
import { getPlayerColorHex } from '../../../game/playerColors'
import { displayCells, tileFinish } from '../../../game/piecePresentation'
import Piece from '../pieces/Piece'

function RobotIcon() {
	return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4v4M9 13v1M15 13v1M9.5 17h5" /><circle cx="12" cy="3.5" r="1" /></svg>
}

function RemainingPiece({ piece, color }) {
	const cells = displayCells(piece.cells)
	const rows = Math.max(...cells.map(([row]) => row)) + 1
	const columns = Math.max(...cells.map(([, col]) => col)) + 1
	return <div className="pieceCard" title={piece.name} data-piece-name={piece.name} data-ability={piece.ability || 'normal'}>
		<span className="pieceShape" style={{ width: columns * 8 + columns - 1, height: rows * 8 + rows - 1 }}>
			{cells.map(([row, col], index) => <i key={index} className="pieceFinishTile" style={{
				width: 8, height: 8, top: row * 9, left: col * 9,
				...tileFinish(getPlayerColorHex(color), piece.ability, 'tray'),
			}} />)}
		</span>
	</div>
}

function PlayerRank({ currentUserId, game, pieceCellSize = 7 }) {
	const [expandedPlayerId, setExpandedPlayerId] = useState(null)
	const [portraitComputer, setPortraitComputer] = useState(() => typeof window !== 'undefined' && window.matchMedia('(orientation: portrait) and (min-width: 700px)').matches)
	const panelRef = useRef(null)
	const rowRef = useRef(null)
	const [page, setPage] = useState(0)
	const playerProgress = useMemo(() => Object.keys(game?.settings?.players || {})
		.map((playerKey, originalIndex) => {
			const player = game.players.find(player => player.settingsPlayerKey === playerKey)
			return {
				player, playerKey, originalIndex,
				placedBlocks: (player?.pieces || []).reduce((total, piece) => total + (piece.placed ? piece.cells.length : 0), 0),
				left: (player?.pieces || []).filter(piece => !piece.placed).length,
			}
		}).sort((a, b) => b.placedBlocks - a.placedBlocks || a.originalIndex - b.originalIndex), [game])
	const hasPages = portraitComputer && playerProgress.length > 3
	const pageStart = hasPages ? Math.min(page * 3, playerProgress.length - 3) : 0
	const visiblePlayers = portraitComputer ? playerProgress.slice(pageStart, pageStart + 3) : playerProgress
	useEffect(() => {
		const query = window.matchMedia('(orientation: portrait) and (min-width: 700px)')
		const update = () => setPortraitComputer(query.matches)
		query.addEventListener('change', update)
		return () => query.removeEventListener('change', update)
	}, [])
	useEffect(() => {
		const row = rowRef.current
		if (!hasPages || !row) return undefined
		let lastPageAt = -Infinity
		const wheel = event => {
			const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
			if (!delta) return
			event.preventDefault()
			if (performance.now() - lastPageAt < 250) return
			lastPageAt = performance.now()
			setPage(delta > 0 ? 1 : 0)
			setExpandedPlayerId(null)
		}
		row.addEventListener('wheel', wheel, { passive: false })
		return () => row.removeEventListener('wheel', wheel)
	}, [hasPages])
	useEffect(() => {
		if (!expandedPlayerId) return undefined
		const closeOutside = event => {
			if (!panelRef.current?.contains(event.target) || !event.target.closest?.('.playerStatusExpanded')) setExpandedPlayerId(null)
		}
		const closeOnEscape = event => {
			if (event.key === 'Escape') setExpandedPlayerId(null)
		}
		document.addEventListener('pointerdown', closeOutside)
		document.addEventListener('keydown', closeOnEscape)
		return () => {
			document.removeEventListener('pointerdown', closeOutside)
			document.removeEventListener('keydown', closeOnEscape)
		}
	}, [expandedPlayerId])
	const togglePlayer = playerId => setExpandedPlayerId(current => current === playerId ? null : playerId)
	return (
		<aside ref={panelRef} className="playerRankPanel" aria-label="Players">
			<div className="playerPanelHeader"><h2 className="gamePanelTitle">Players</h2></div>
			<div className={`playerPager${hasPages ? ' hasPages' : ''}`}>
				{hasPages && <button type="button" className="playerPageArrow" aria-label="Previous players" disabled={pageStart === 0} onClick={() => { setPage(0); setExpandedPlayerId(null) }}>‹</button>}
			<div className="playerPanelGrid" ref={rowRef}>
				{visiblePlayers.map(({ player, playerKey, placedBlocks, left }) => {
					const isYou = player?.id === currentUserId
					const expanded = player?.id === expandedPlayerId
					const total = player?.pieces.length || 16
					const canView = player && !isYou
					const placed = total - left
					return (
						<div key={player?.id || playerKey} className={`playerStatusCard${player?.id === game.currentPlayerId ? ' playerStatusActive' : ''}${expanded ? ' playerStatusExpanded' : ''}`}
							style={{ '--player-color': getPlayerColorHex(player?.color) }}>
							<span className="playerStatusColor" aria-hidden="true">{player?.isBot && <RobotIcon />}</span>
							<span className="playerStatusName" title={player?.name}>{player?.name || playerKey}{isYou ? <small> (you)</small> : ''}</span>
							<span className="playerPiecePips" aria-label={`${placed} of ${total} pieces placed`}>
								{Array.from({ length: total }, (_, index) => <i key={index} className={index < placed ? 'placed' : ''} />)}
							</span>
							<span className="playerStatusBlocks" title="Blocks placed">{placedBlocks}<small>pts</small></span>
							{canView && <svg className="playerStatusChevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>}
							<div className="playerPiecesProgress" aria-label={`${left} of ${total} pieces left`}><span style={{ width: `${left / total * 100}%` }} /></div>
							<div className="playerStatusBody">
								<span className="playerPiecesLeft">{left}/{total}</span>
								{canView && <button type="button" className="viewPiecesButton" aria-expanded={expanded}
									onClick={() => togglePlayer(player.id)}>
									{expanded ? 'Hide' : 'Pieces'}
								</button>}
							</div>
							{expanded && !portraitComputer && <div className="playerRemainingPieces">
								{player.pieces.map(piece => <Piece key={piece.name} piece={piece} placed={piece.placed}
									color={player.color} cellSize={pieceCellSize} staticPreview />)}
							</div>}
							{expanded && canView && portraitComputer && <div className="playerPiecesPopover" role="region" aria-label={`${player.name}'s remaining pieces`} onClick={event => event.stopPropagation()}>
								<div>{player.pieces.filter(piece => !piece.placed).map(piece => <RemainingPiece key={piece.name} piece={piece} color={player.color} />)}</div>
							</div>}
						</div>
					)
				})}
			</div>
				{hasPages && <button type="button" className="playerPageArrow" aria-label="Next players" disabled={pageStart === playerProgress.length - 3} onClick={() => { setPage(1); setExpandedPlayerId(null) }}>›</button>}
			</div>
		</aside>
	)
}

export default PlayerRank
