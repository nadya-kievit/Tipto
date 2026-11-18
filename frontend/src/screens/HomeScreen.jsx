import { useState } from 'react'
import { OTPInput } from 'input-otp'
import '../styles/home.css'

function HomeScreen({ onEnterGame, onConfigureGame, actionError = '', enteringAction = null}) {
	const [inviteCode, setInviteCode] = useState('')

	const handleJoinGame = event => {
		event.preventDefault()
		onEnterGame(inviteCode)
	}
	
	return (
		<div className="homeScreen">

			<h1 className="homeLogo">
				<span className="homeLogoMark"><i/><i/><i/></span>
				<span>Tipto</span>
			</h1>

			<div className="homeCard">
				<button
					className="homeCreateButton"
					onClick={onConfigureGame}
					disabled={enteringAction !== null}
				>
					{enteringAction === 'create' ? 'Creating game…' : 'Create game'}
					{enteringAction === 'create' && <span className="homeButtonLoadingBar" />}
				</button>

				<div className="homeDivider">
					<span>or join with a code</span>
				</div>

				<form className="homeJoinForm" onSubmit={handleJoinGame}>
					<OTPInput
						containerClassName="codeInputContainer"
						inputMode="numeric"
						autoComplete="one-time-code"
						pattern="^[0-9]*$"
						maxLength={6}
						value={inviteCode}
						onChange={setInviteCode}
						pasteTransformer={text => text.replace(/\D/g, '')}
						render={({ slots }) => (
							<div className="codeInputGroup">
								{slots.map((slot, index) => (
									<span key={index} className="codeDigit" data-active={slot.isActive} data-caret={slot.hasFakeCaret}>
										{slot.char}
									</span>
								))}
							</div>
						)}
					/>

					<button
						className="homeJoinButton"
						type="submit"
						disabled={inviteCode.length !== 6 || enteringAction !== null}
					>
						{enteringAction === 'join' ? 'Joining game…' : 'Join game'}
						{enteringAction === 'join' && <span className="homeButtonLoadingBar" />}
					</button>
				</form>

				{actionError && (
					<div className="homeError">
						{actionError}
					</div>
				)}
			</div>
		</div>
	)
}

export default HomeScreen