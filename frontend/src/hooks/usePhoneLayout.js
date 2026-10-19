import { useEffect, useState } from 'react'

const LANDSCAPE_QUERY = '(pointer: coarse) and (orientation: landscape) and (max-height: 500px)'
const PORTRAIT_QUERY = '(pointer: coarse) and (orientation: portrait) and (max-width: 500px)'

function readPhoneMode() {
	if (typeof window === 'undefined' || !window.matchMedia) return 'desktop'
	if (window.matchMedia(LANDSCAPE_QUERY).matches) return 'landscape'
	if (window.matchMedia(PORTRAIT_QUERY).matches) return 'portrait'
	return 'desktop'
}

export default function usePhoneLayout() {
	const [mode, setMode] = useState(readPhoneMode)

	useEffect(() => {
		const landscape = window.matchMedia(LANDSCAPE_QUERY)
		const portrait = window.matchMedia(PORTRAIT_QUERY)
		const update = () => setMode(readPhoneMode())
		landscape.addEventListener('change', update)
		portrait.addEventListener('change', update)
		return () => {
			landscape.removeEventListener('change', update)
			portrait.removeEventListener('change', update)
		}
	}, [])

	return mode
}
