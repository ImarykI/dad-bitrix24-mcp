export interface TruncatedText {
  readonly text: string
  readonly truncated: boolean
}

export function truncateMcpText(value: string, maxCharacters: number): TruncatedText {
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 1) {
    throw new RangeError('maxCharacters must be a positive integer')
  }

  const text = value.replaceAll(String.fromCharCode(0), '')
  if (text.length <= maxCharacters) return { text, truncated: false }

  const marker = '...[truncated]'
  if (maxCharacters <= marker.length) {
    return { text: marker.slice(0, maxCharacters), truncated: true }
  }
  return {
    text: `${text.slice(0, maxCharacters - marker.length)}${marker}`,
    truncated: true,
  }
}