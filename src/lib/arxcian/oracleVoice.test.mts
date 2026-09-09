import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSpeechSplitter, speakableText } from './speakable.ts'
import { isPermissionError, recognitionErrorMessage } from './voice/speechRecognition.ts'
import { prepareOracleVoiceTurn } from './oracleVoiceTurn.ts'

test('Oracle-vastaus siivotaan markdownista ennen puhesynteesiä', () => {
  assert.equal(
    speakableText('## **Oracle**\n- [Raportti](https://example.invalid) on `valmis`.'),
    'Oracle\nRaportti on valmis.',
  )
})

test('Oracle-vastaus lähtee puhejonoon lauseittain ja loppu flushataan', () => {
  const splitter = createSpeechSplitter()
  assert.deepEqual(splitter.push('Ensimmäinen vastaus on valmis. Toinen'), ['Ensimmäinen vastaus on valmis.'])
  assert.deepEqual(splitter.flush(), ['Toinen'])
})

test('Oracle-ajo estää mikrofonin ennen puhejonon perumista', () => {
  const streaming = { current: false }
  const order: string[] = []
  prepareOracleVoiceTurn({
    streaming,
    stopCapture: () => order.push(`capture:${streaming.current}`),
    cancelSpeech: () => order.push(`speech:${streaming.current}`),
  })
  assert.equal(streaming.current, true)
  assert.deepEqual(order, ['capture:true', 'speech:true'])
})

test('mikrofoniluvan esto erotetaan verkkovirheestä käyttäjälle', () => {
  assert.equal(isPermissionError('not-allowed'), true)
  assert.equal(isPermissionError('network'), false)
  assert.equal(recognitionErrorMessage('not-allowed'), 'mikrofonilupa evätty')
})
