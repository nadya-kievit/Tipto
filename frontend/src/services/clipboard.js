export async function copyText(text, {
	clipboard = globalThis.navigator?.clipboard,
	document: doc = globalThis.document,
} = {}) {
	if (clipboard?.writeText) {
		try {
			await clipboard.writeText(text)
			return
		} catch {
			// Some mobile browsers expose the API but reject the write.
		}
	}

	const focused = doc.activeElement
	const selection = doc.getSelection()
	const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index)) : []
	const field = doc.createElement('textarea')
	field.value = text
	field.readOnly = true
	field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;'
	doc.body.appendChild(field)
	try {
		field.focus({ preventScroll: true })
		field.select()
		field.setSelectionRange(0, text.length)
		if (!doc.execCommand('copy')) throw new Error('Could not copy text')
	} finally {
		field.remove()
		focused?.focus({ preventScroll: true })
		if (selection) {
			selection.removeAllRanges()
			for (const range of ranges) selection.addRange(range)
		}
	}
}
