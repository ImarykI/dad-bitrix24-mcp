import { describe, expect, it } from 'vitest'
import { decodeInlineBase64File, isSafeUploadFileName } from '~/server/utils/base64-file'

describe('inline file input validation', () => {
  it('accepts safe names and rejects empty names, path separators, and control characters', () => {
    expect(isSafeUploadFileName('report.pdf')).toBe(true)
    expect(isSafeUploadFileName('')).toBe(false)
    expect(isSafeUploadFileName('../report.pdf')).toBe(false)
    expect(isSafeUploadFileName('folder\\report.pdf')).toBe(false)
    expect(isSafeUploadFileName('report\n.pdf')).toBe(false)
  })

  it('decodes canonical standard Base64 within the 5 MiB limit', () => {
    expect(decodeInlineBase64File('aGVsbG8=').toString('utf8')).toBe('hello')
    expect(() => decodeInlineBase64File('@@@=')).toThrow(/Base64/)
    expect(() => decodeInlineBase64File('')).toThrow(/Base64|empty/)
  })

  it('rejects oversize input before decoding', () => {
    const tooLarge = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')
    expect(() => decodeInlineBase64File(tooLarge)).toThrow(/5 MiB/)
  })
})