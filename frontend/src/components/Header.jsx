import { useEffect, useRef, useState } from 'react'
import '../styles/header.css'

export default function Header({ screen, gameId, onLeave, leaveDisabled = false, onCopyError, children, actions }) {
	const [copied, setCopied] = useState(false)
	const copyTimer = useRef(null)

	useEffect(() => () => clearTimeout(copyTimer.current), [])

	const copyInvite = async () => {
		try {
			await navigator.clipboard.writeText(window.location.href)
			setCopied(true)
			clearTimeout(copyTimer.current)
			copyTimer.current = setTimeout(() => setCopied(false), 1800)
		} catch {
			onCopyError?.('Could not copy the invite link.')
		}
	}

	return <header className={`appHeader${children ? ' appHeaderWithCenter' : ''}`}>
		<h1 className="headerLogo"><span className="headerLogoMark" aria-hidden="true"><i /><i /><i /></span>Tipto</h1>
		{children && <div className="headerCenter">{children}</div>}
		<div className="headerActions">
			{screen == 'lobby' && (
			<div className="headerInvite">
				<div className="headerRoomCode">
					<span>Room code</span>
					<strong>{`${gameId.slice(0, 3)} ${gameId.slice(3)}`.trim()}</strong>
				</div>
				<button type="button" className={`headerCopy${copied ? ' copied' : ''}`} onClick={copyInvite} aria-label={copied ? 'Link copied' : 'Copy invite link'}>
					<span className="headerCopyIcons" aria-hidden="true">
						<svg className={copied ? 'hidden' : ''} viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M16 8V4H4v12h4" /></svg>
						<svg className={copied ? '' : 'hidden'} viewBox="0 0 24 24"><path d="m5 12 4 4 10-10" /></svg>
					</span>
					<span aria-live="polite">{copied ? 'Link copied' : 'Copy invite link'}</span>
				</button>
			</div>
			)}
			<button type="button" className="headerLeave" onClick={onLeave} disabled={leaveDisabled}>Leave room</button>
			{actions}
		</div>
	</header>
}
