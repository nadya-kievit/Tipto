export const PLAYER_COLOR_HEX = Object.freeze({
	Blue: '#0077ee',
	Red: '#e34242',
	Green: '#28a745',
	Yellow: '#f3b51b',
	Pink:   '#e83e8c',
	Purple: '#8e44ad',
	Cyan:   '#17a2b8',
	Orange: '#f47c20'
})

export const PLAYER_COLORS = Object.freeze([
	{ name: 'Red', hex: PLAYER_COLOR_HEX.Red },
	{ name: 'Blue', hex: PLAYER_COLOR_HEX.Blue },
	{ name: 'Green', hex: PLAYER_COLOR_HEX.Green },
	{ name: 'Yellow', hex: PLAYER_COLOR_HEX.Yellow },
	{ name: 'Pink', hex: PLAYER_COLOR_HEX.Pink },
	{ name: 'Purple', hex: PLAYER_COLOR_HEX.Purple },
	{ name: 'Cyan', hex: PLAYER_COLOR_HEX.Cyan },
	{ name: 'Orange', hex: PLAYER_COLOR_HEX.Orange },
])

export const DEFAULT_PLAYER_COLOR = PLAYER_COLOR_HEX.Blue

export function getPlayerColorHex(colorName, fallback = DEFAULT_PLAYER_COLOR) {
	return PLAYER_COLOR_HEX[colorName] ||
		(typeof colorName === 'string' && colorName.startsWith('#') ? colorName : fallback)
}
