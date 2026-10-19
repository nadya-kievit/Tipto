import { useLayoutEffect, useMemo, useState } from 'react'

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))

function readUiScale() {
	if (typeof window === 'undefined') return 1
	return clamp(Math.min(window.innerHeight / 940, window.innerWidth / 1910), 0.72, 1.6)
}

export default function useUiScale() {
	const [uiScale, setUiScale] = useState(readUiScale)

	useLayoutEffect(() => {
		const update = () => setUiScale(readUiScale())
		window.addEventListener('resize', update)
		return () => window.removeEventListener('resize', update)
	}, [])

	return useMemo(() => ({
		uiScale,
		style: {
			'--ui-scale': uiScale,
			'--text-scale': clamp(uiScale, 0.9, 1.35),
		},
	}), [uiScale])
}
