import { useEffect, useRef, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { copyText } from '../services/clipboard'
import '../styles/header.css'

export default function Header({ screen, gameId, onLeave, leaveDisabled = false, onCopyError, children }) {
	const [copied, setCopied] = useState(false)
	const copyTimer = useRef(null)

	useEffect(() => () => clearTimeout(copyTimer.current), [])

	const copyInvite = async () => {
		try {
			await copyText(window.location.href)
			setCopied(true)
			clearTimeout(copyTimer.current)
			copyTimer.current = setTimeout(() => setCopied(false), 1800)
		} catch {
			setCopied(false)
			clearTimeout(copyTimer.current)
			onCopyError?.('Could not copy the invite link.')
		}
	}

	return (
		<header className="appHeader">
			<h1 className="headerLogo">
				<span className="headerLogoMark" aria-hidden={screen === 'lobby' ? undefined : true}>
					<i /><i /><i />
				</span>
				Tipto
			</h1>
			
			{children && 
				<div className="headerCenter">
					{children}
				</div>
			}

			<div className="headerActions">
				{screen == 'lobby' && (
					<div className="headerInvite">
						<div className="headerRoomCode">
							<span>Room code</span>
							<strong>
								{`${gameId.slice(0, 3)} ${gameId.slice(3)}`.trim()}
							</strong>
						</div>
						<button type="button" className={`headerCopy${copied ? ' copied' : ''}`} onClick={copyInvite}>
							<span className="headerCopyIcons">
								{copied ? <Check /> : <Copy />}
							</span>
							<span>{copied ? 'Link copied' : 'Copy invite link'}</span>
						</button>
					</div>
				)}

				<button 
					type="button" 
					className="headerLeave" 
					onClick={onLeave} 
					disabled={leaveDisabled}
				>
					Leave room
				</button>
			</div>
		</header>
	)
}
