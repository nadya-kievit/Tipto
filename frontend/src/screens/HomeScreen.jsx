import { useRef, useState } from 'react'
import '../styles/home.css'

function HomeScreen({ onEnterGame, onConfigureGame, actionError = '', enteringAction = null}) {
	const [inviteCode, setInviteCode] = useState('')
	const codeInputRefs = useRef([])


	const handleJoinGame = event => {
		event.preventDefault()
		onEnterGame(inviteCode)
	}

	const focusCodeInput = index => {
		codeInputRefs.current[index]?.focus()
	}

	const updateInviteCode = (index, value) => {
		const digits = value.replace(/\D/g, '').slice(0, 6 - index)
		const before = inviteCode.slice(0, index)
		const after = inviteCode.slice(index + (digits.length || 1))
		const nextCode = before + digits + after

		setInviteCode(nextCode)
		if (digits) focusCodeInput(Math.min(nextCode.length, 5))
	}

	const handleCodeKeyDown = (event, index) => {
		if (event.key === 'Backspace' && !inviteCode[index] && index > 0) {
			event.preventDefault()
			updateInviteCode(index - 1, '')
			focusCodeInput(index - 1)
			return
		}

		const nextIndex = { ArrowLeft: index - 1, ArrowRight: index + 1 }[event.key]
		if (nextIndex >= 0 && nextIndex < 6) {
			event.preventDefault()
			focusCodeInput(nextIndex)
		}
	}

	const handleCodePaste = (event, index) => {
		event.preventDefault()
		updateInviteCode(index, event.clipboardData.getData('text'))
	}

	
	return (
		<div className="startPage createGamePage homeScreen">

			<div className="homeBrand">
				<h1 className="gameTitle homeLogo">
					<span className="homeLogoMark" aria-hidden="true"><i /><i /><i /></span>
					<span>Tipto</span>
				</h1>
				<p className="homeTagline">Claim the board, one corner at a time.</p>
			</div>

			<div className="startPanel createGamePanel homeCard">
				<button
					className="homeCreateButton"
					onClick={onConfigureGame}
					disabled={enteringAction !== null}
					aria-busy={enteringAction === 'create'}
				>
					{enteringAction === 'create' ? 'Creating game…' : 'Create game'}
					{enteringAction === 'create' && <span className="homeButtonLoadingBar" aria-hidden="true" />}
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

					<button
						className="homeJoinButton"
						type="submit"
						disabled={inviteCode.length !== 6 || enteringAction !== null}
						aria-busy={enteringAction === 'join'}
					>
						{enteringAction === 'join' ? 'Joining game…' : 'Join game'}
						{enteringAction === 'join' && <span className="homeButtonLoadingBar" aria-hidden="true" />}
					</button>
				</form>

				{actionError && (
					<div className="statusMessage statusMessageError">
						{actionError}
					</div>
				)}
			</div>
		</div>
	)
}

export default HomeScreen
