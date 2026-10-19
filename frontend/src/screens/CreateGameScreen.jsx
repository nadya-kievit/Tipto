import { useEffect, useRef, useState } from 'react'
import { wakeGameServer } from '../services/api'
import './HomeScreen.css'

const BACKGROUND_PIECES = [
	{ left: 9, top: 12, color: '#8B5CF6', shape: ['##.', '.##', '..#'] },
	{ left: 80, top: 16, color: '#F97316', shape: ['####', '#...'] },
	{ left: 6, top: 66, color: '#14B8A6', shape: ['.#', '##', '.#'] },
	{ left: 84, top: 68, color: '#3B82F6', shape: ['##', '##'] },
	{ left: 22, top: 84, color: '#EC4899', shape: ['#####'] },
	{ left: 66, top: 82, color: '#EAB308', shape: ['#..', '###'] },
]

function CreateGameScreen({ onEnterGame, onConfigureGame, actionError = '', isEntering = false, isPhoneLandscape = false }) {
	const [inviteCode, setInviteCode] = useState('')
	const [error, setError] = useState('')
	const codeInputRefs = useRef([])
	const pageRef = useRef(null)


	useEffect(() => {
		wakeGameServer().catch(() => {})
	}, [])


	useEffect(() => {
		const page = pageRef.current
		const viewport = window.visualViewport

		document.body.classList.add('createGameActive')

		if (!page || !viewport) {
			return () => document.body.classList.remove('createGameActive')
		}

		let expandedViewportHeight = viewport.height
		let viewportWidth = viewport.width
		let isKeyboardOpen = false
		let animationFrame = null

		const syncVisualViewport = () => {
			if (Math.abs(viewport.width - viewportWidth) > 50) {
				viewportWidth = viewport.width
				expandedViewportHeight = viewport.height
				isKeyboardOpen = false
			}

			expandedViewportHeight = Math.max(expandedViewportHeight, viewport.height)

			const viewportReduction = expandedViewportHeight - viewport.height
			const openThreshold = Math.max(96, expandedViewportHeight * 0.14)
			const codeInputIsFocused = document.activeElement?.matches('.codeInputGroup input')

			if (!isKeyboardOpen && codeInputIsFocused && viewportReduction > openThreshold) {
				isKeyboardOpen = true
			}

			if (isKeyboardOpen && viewportReduction < 32) {
				isKeyboardOpen = false
			}

			page.classList.toggle('keyboardOpen', isKeyboardOpen)
			page.style.setProperty('--visual-viewport-height', `${viewport.height}px`)
			page.style.setProperty('--visual-viewport-offset', `${viewport.offsetTop}px`)
		}

		const scheduleVisualViewportSync = () => {
			if (animationFrame !== null) {
				cancelAnimationFrame(animationFrame)
			}

			animationFrame = requestAnimationFrame(() => {
				animationFrame = null
				syncVisualViewport()
			})
		}

		syncVisualViewport()
		viewport.addEventListener('resize', scheduleVisualViewportSync)
		viewport.addEventListener('scroll', scheduleVisualViewportSync)

		return () => {
			document.body.classList.remove('createGameActive')
			page.classList.remove('keyboardOpen')
			viewport.removeEventListener('resize', scheduleVisualViewportSync)
			viewport.removeEventListener('scroll', scheduleVisualViewportSync)

			if (animationFrame !== null) {
				cancelAnimationFrame(animationFrame)
			}
		}
	}, [])


	const handleJoinGame = event => {
		event.preventDefault()

		if (!/^\d{6}$/.test(inviteCode)) {
			setError('Enter a 6 digit invite code.')
			return
		}

		onEnterGame(inviteCode)
	}


	const focusCodeInput = index => {
		codeInputRefs.current[index]?.focus()
	}


	const updateInviteCode = (index, value) => {
		const digits = value.replace(/\D/g, '')

		if (!digits) {
			setInviteCode(inviteCode.slice(0, index) + inviteCode.slice(index + 1))
			return
		}

		const nextCode = inviteCode.padEnd(6, ' ').split('')

		digits.slice(0, 6 - index).split('').forEach((digit, offset) => {
			nextCode[index + offset] = digit
		})

		const compactCode = nextCode.join('').replace(/\s/g, '').slice(0, 6)
		setInviteCode(compactCode)
		focusCodeInput(Math.min(compactCode.length, 5))
	}


	const handleCodeKeyDown = (event, index) => {
		if (event.key === 'Backspace' && !inviteCode[index] && index > 0) {
			event.preventDefault()
			setInviteCode(inviteCode.slice(0, index - 1) + inviteCode.slice(index))
			focusCodeInput(index - 1)
		}

		if (event.key === 'ArrowLeft' && index > 0) {
			event.preventDefault()
			focusCodeInput(index - 1)
		}

		if (event.key === 'ArrowRight' && index < 5) {
			event.preventDefault()
			focusCodeInput(index + 1)
		}
	}


	const handleCodePaste = (event, index) => {
		event.preventDefault()
		updateInviteCode(index, event.clipboardData.getData('text'))
	}

	
	return (
		<div ref={pageRef} className={`startPage createGamePage homeScreen${isPhoneLandscape ? ' phoneLandscape' : ''}`}>
			<div className="homeBackground" aria-hidden="true">
				{BACKGROUND_PIECES.map((piece, pieceIndex) => (
					<span
						key={pieceIndex}
						className="homeDecorationPiece"
						style={{
							left: `${piece.left}%`,
							top: `${piece.top}%`,
							'--home-piece-color': piece.color,
							'--home-piece-columns': piece.shape[0].length,
						}}
					>
						{piece.shape.flatMap((row, rowIndex) =>
							[...row].map((cell, columnIndex) => cell === '#' && (
								<i
									key={`${rowIndex}-${columnIndex}`}
									style={{ gridRow: rowIndex + 1, gridColumn: columnIndex + 1 }}
								/>
							))
						)}
					</span>
				))}
			</div>

			<div className="homeBrand">
				<h1 className="gameTitle homeLogo">
					<span className="homeLogoMark" aria-hidden="true"><i /><i /><i /></span>
					<span>Tipto</span>
				</h1>
				<p className="homeTagline">Claim the board, one corner at a time.</p>
			</div>

			<div className="startPanel createGamePanel homeCard">
				<button className="homeCreateButton" onClick={onConfigureGame} disabled={isEntering}>
					Create game
				</button>

				<div className="startDivider homeDivider">
					<span>or join with a code</span>
				</div>

				<form className="joinForm homeJoinForm" onSubmit={handleJoinGame}>
					<div className="codeInputGroup" aria-label="6 digit invite code">
						{Array.from({ length: 6 }).map((_, index) => (
							<input
								key={index}
								ref={element => {
									codeInputRefs.current[index] = element
								}}
								aria-label={`Invite code digit ${index + 1}`}
								inputMode="numeric"
								autoComplete="one-time-code"
								pattern="[0-9]*"
								maxLength="6"
								value={inviteCode[index] || ''}
								onChange={event => updateInviteCode(index, event.target.value)}
								onFocus={event => event.target.select()}
								onKeyDown={event => handleCodeKeyDown(event, index)}
								onPaste={event => handleCodePaste(event, index)}
							/>
						))}
					</div>

					<button className="homeJoinButton" type="submit" disabled={inviteCode.length !== 6 || isEntering}>
						Join game
					</button>
				</form>

				{(error || actionError) && (
					<div className="statusMessage statusMessageError">
						{error || actionError}
					</div>
				)}
			</div>
		</div>
	)
}

export default CreateGameScreen
