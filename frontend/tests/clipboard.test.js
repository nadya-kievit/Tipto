import assert from 'node:assert/strict'
import test from 'node:test'
import { copyText } from '../src/services/clipboard.js'

function fallbackDocument({ succeeds = true, throws = false } = {}) {
	const events = []
	const range = {}
	const selection = {
		rangeCount: 1,
		getRangeAt: () => range,
		removeAllRanges: () => events.push('clear selection'),
		addRange: restored => assert.equal(restored, range),
	}
	const field = {
		style: {},
		focus: () => events.push('focus'),
		select: () => events.push('select'),
		setSelectionRange: (start, end) => events.push([start, end]),
		remove: () => events.push('remove'),
	}
	const document = {
		activeElement: { focus: () => events.push('restore focus') },
		getSelection: () => selection,
		createElement: tag => { assert.equal(tag, 'textarea'); return field },
		body: { appendChild: element => assert.equal(element, field) },
		execCommand: command => {
			assert.equal(command, 'copy')
			events.push('copy')
			if (throws) throw new Error('Copy blocked')
			return succeeds
		},
	}
	return { document, field, events }
}

test('copies the exact invite URL through the Clipboard API', async () => {
	const text = 'https://tipto.example/lobby/ABC123'
	await copyText(text, {
		clipboard: { writeText: async value => assert.equal(value, text) },
		document: null,
	})
})

test('copies synchronously when the Clipboard API is unavailable', async () => {
	const { document, field, events } = fallbackDocument()
	const pending = copyText('invite link', { clipboard: null, document })
	assert.ok(events.includes('copy'), 'fallback runs within the original click gesture')
	await pending
	assert.equal(field.value, 'invite link')
	assert.equal(field.readOnly, true)
	assert.deepEqual(events, ['focus', 'select', [0, 11], 'copy', 'remove', 'restore focus', 'clear selection'])
})

test('falls back when the Clipboard API rejects a write', async () => {
	const { document, events } = fallbackDocument()
	await copyText('invite', {
		clipboard: { writeText: async () => { throw new Error('Not allowed') } },
		document,
	})
	assert.ok(events.includes('copy'))
})

for (const options of [{ succeeds: false }, { throws: true }]) {
	test(`reports failure and restores focus and selection when fallback ${options.throws ? 'throws' : 'returns false'}`, async () => {
		const { document, events } = fallbackDocument(options)
		await assert.rejects(copyText('invite', { clipboard: null, document }))
		assert.deepEqual(events.slice(-3), ['remove', 'restore focus', 'clear selection'])
	})
}
