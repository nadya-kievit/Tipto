import { useLayoutEffect, useState } from 'react'

const STORAGE_KEY = 'tipto-theme'

function getInitialTheme() {
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		if (stored === 'light' || stored === 'dark') return stored
	} catch {
		// Storage can be unavailable in privacy modes; dark remains the safe default.
	}
	return 'dark'
}

export default function useTheme() {
	const [theme, setTheme] = useState(getInitialTheme)

	useLayoutEffect(() => {
		document.documentElement.dataset.theme = theme
		try {
			localStorage.setItem(STORAGE_KEY, theme)
		} catch {
			// The active theme still works for this session when persistence is blocked.
		}
	}, [theme])

	return [theme, setTheme]
}
