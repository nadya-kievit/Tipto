import { useRef, useState } from 'react'

const TIMER_MIN = 30

const TIMER_MAX = 90

const DIAL_CX = 110

const DIAL_CY = 110

const DIAL_RADIUS = 70

const DIAL_START = 135

const DIAL_SWEEP = 270

function polar(angle, radius = DIAL_RADIUS) {
	const radians = angle * Math.PI / 180
	return {
		x: DIAL_CX + Math.cos(radians) * radius,
		y: DIAL_CY + Math.sin(radians) * radius
	}
}

function timerAngle(value) {
	return DIAL_START + (value - TIMER_MIN) / (TIMER_MAX - TIMER_MIN) * DIAL_SWEEP
}

function arcPath(endAngle) {
	const start = polar(DIAL_START)
	const end = polar(endAngle)
	const sweep = endAngle - DIAL_START
	return `M ${start.x} ${start.y} A ${DIAL_RADIUS} ${DIAL_RADIUS} 0 ${sweep > 180 ? 1 : 0} 1 ${end.x} ${end.y}`
}

function timerFromPointer(event, element, requireRing = true) {
	const bounds = element.getBoundingClientRect()
	const x = (event.clientX - bounds.left) * 220 / bounds.width
	const y = (event.clientY - bounds.top) * 205 / bounds.height
	const dx = x - DIAL_CX
	const dy = y - DIAL_CY
	if (requireRing && Math.abs(Math.hypot(dx, dy) - DIAL_RADIUS) > 24) return null
	let angle = Math.atan2(dy, dx) * 180 / Math.PI
	if (angle < 0) {
		angle += 360
	}
	let progress
	if (angle > 45 && angle < 135) {
		progress = angle < 90 ? 1 : 0
	} else {
		if (angle < DIAL_START) {
			angle += 360
		}
		progress = Math.max(0, Math.min(1, (angle - DIAL_START) / DIAL_SWEEP))
	}
	return Math.round((TIMER_MIN + progress * (TIMER_MAX - TIMER_MIN)) / 5) * 5
}

function TimerDial({ value, readOnly, disabled, saving, onChange }) {
	const [draft, setDraft] = useState(null)
	const [optimisticValue, setOptimisticValue] = useState(undefined)
	const [ghostValue, setGhostValue] = useState(null)
	const [lastValue, setLastValue] = useState(value ?? 60)
	const faceRef = useRef(null)
	const dragging = draft !== null
	const effectiveValue = draft ?? (optimisticValue !== undefined ? optimisticValue : value)
	const shown = effectiveValue ?? lastValue
	const noLimit = effectiveValue === null
	const inactive = readOnly || disabled || noLimit
	const save = next => {
		if (next !== null) {
			setLastValue(next)
		}
		setOptimisticValue(next)
		return Promise.resolve().then(() => onChange(next)).finally(() => setOptimisticValue(current => Object.is(current, next) ? undefined : current))
	}

	const beginDrag = event => {
		if (inactive || event.pointerType === 'touch' && !event.target.classList.contains('dialKnobHitTarget')) return
		const next = timerFromPointer(event, faceRef.current)
		if (next === null) return
		faceRef.current.setPointerCapture(event.pointerId)
		setDraft(next)
	}

	const commit = event => {
		if (!dragging) return
		const next = timerFromPointer(event, faceRef.current, false)
		setDraft(null)
		if (next !== null) {
			save(next)
		}
	}

	const keyDown = event => {
		if (inactive) return
		const changes = {
			ArrowLeft: -5,
			ArrowDown: -5,
			ArrowRight: 5,
			ArrowUp: 5,
			PageDown: -15,
			PageUp: 15
		}
		let next = shown
		if (event.key === 'Home') {
			next = 30
		} else if (event.key === 'End') {
			next = 90
		} else if (changes[event.key]) {
			next += changes[event.key]
		} else {
			return
		}
		event.preventDefault()
		next = Math.max(30, Math.min(90, next))
		save(next)
	}

	const knob = polar(timerAngle(shown))
	const ghost = ghostValue === null ? null : polar(timerAngle(ghostValue))
	return (
		<div className="lobbyTimerControls">
			<div className={`lobbyTimerDial${noLimit ? ' noLimit' : ''}${readOnly ? ' readOnly' : ''}`}>
				<div
					ref={faceRef}
					className="lobbyDialFace"
					role="slider"
					tabIndex={inactive ? -1 : 0}
					aria-label="Turn timer"
					aria-valuemin="30"
					aria-valuemax="90"
					aria-valuenow={noLimit ? undefined : shown}
					aria-valuetext={noLimit ? 'No limit' : `${shown} seconds`}
					aria-disabled={inactive}
					onKeyDown={keyDown}
					onPointerDown={beginDrag}
					onPointerMove={event => {
						if (inactive || event.pointerType === 'touch' && !dragging) return
						const next = timerFromPointer(event, faceRef.current, !dragging)
						setGhostValue(event.pointerType === 'touch' ? null : next)
						if (dragging && next !== null) {
							setDraft(next)
						}
					}}
					onPointerUp={commit}
					onPointerCancel={() => {
						setDraft(null)
					}}
					onPointerLeave={() => !dragging && setGhostValue(null)}
				>
					<svg viewBox="0 0 220 205" aria-hidden="true">
						<path className="dialTrack" d={arcPath(405)} />
						<path className="dialFill" d={arcPath(timerAngle(shown))} />
						{Array.from({
							length: 13
						}, (_, index) => {
							const tick = 30 + index * 5
							const angle = timerAngle(tick)
							const inside = polar(angle, 80)
							const outside = polar(angle, index % 6 === 0 ? 91 : 86)
							return (
								<line key={tick} className={index % 6 === 0 ? 'major' : ''} x1={inside.x} y1={inside.y} x2={outside.x} y2={outside.y} />
							)
						})}
						{ghost && <circle className="dialGhost" cx={ghost.x} cy={ghost.y} r="10" />}
						<circle className="dialKnob" cx={knob.x} cy={knob.y} r="10" />
						<circle className="dialKnobHitTarget" cx={knob.x} cy={knob.y} r="16" />
					</svg>
					{[30, 60, 90].map(timer => {
						const point = polar(timerAngle(timer), 102)
						return (
							<span
								key={timer}
								className="dialLabel"
								style={{
									left: Math.round(point.x),
									top: Math.round(point.y)
								}}
							>
								{timer}
							</span>
						)
					})}
					<div className="dialValue">
						<strong>
							{noLimit ? '\u221e' : shown}
						</strong>
						<span>
							{noLimit ? 'no limit' : 'sec'}
						</span>
					</div>
				</div>
			</div>
			<label className="lobbyNoLimit">
				<span>No limit</span>
				<input
					type="checkbox"
					checked={noLimit}
					disabled={readOnly || disabled}
					data-saving-settings={saving || undefined}
					onChange={event => {
						if (event.target.checked && effectiveValue !== null) {
							setLastValue(effectiveValue)
						}
						save(event.target.checked ? null : lastValue)
					}}
				/>
				<i aria-hidden="true">
					<b />
				</i>
			</label>
		</div>
	)
}

export default TimerDial
