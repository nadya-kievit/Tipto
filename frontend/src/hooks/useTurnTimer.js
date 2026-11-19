import { useEffect, useState } from 'react'

export default function useTurnTimer(endsAt, limit) {
	const [now, setNow] = useState(Date.now)

	useEffect(() => {
		if (endsAt == null) return undefined

		const interval = setInterval(() => {
			const currentTime = Date.now()
			setNow(currentTime)
			if (currentTime >= endsAt) clearInterval(interval)
		}, 250)
		return () => clearInterval(interval)
	}, [endsAt])

	const remaining = endsAt == null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000))
	const fraction = limit > 0 ? Math.min(1, remaining / limit) : 0
	const text = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`

	return { remaining, fraction, text }
}
