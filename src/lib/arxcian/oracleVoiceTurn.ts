export type MutableBooleanRef = { current: boolean }

export function prepareOracleVoiceTurn({
  streaming,
  stopCapture,
  cancelSpeech,
}: {
  streaming: MutableBooleanRef
  stopCapture(): void
  cancelSpeech(): void
}): void {
  streaming.current = true
  stopCapture()
  cancelSpeech()
}
