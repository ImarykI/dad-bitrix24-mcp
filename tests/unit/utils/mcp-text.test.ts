import { describe, expect, it } from 'vitest'
import { truncateMcpText } from '~/server/utils/mcp-text'

describe('truncateMcpText', () => {
  it('preserves short text and removes null bytes', () => {
    expect(truncateMcpText('ab\u0000cd', 10)).toEqual({ text: 'abcd', truncated: false })
  })

  it('returns a bounded text marker when the input is too long', () => {
    const result = truncateMcpText('x'.repeat(30), 20)
    expect(result).toEqual({ text: 'xxxxxx...[truncated]', truncated: true })
    expect(result.text.length).toBeLessThanOrEqual(20)
  })

  it('rejects invalid limits', () => {
    expect(() => truncateMcpText('text', 0)).toThrow(RangeError)
    expect(() => truncateMcpText('text', 1.5)).toThrow(RangeError)
  })
})