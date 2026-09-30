import { Buffer } from 'node:buffer'
import { Bitrix24ErrorCode, Bitrix24ToolError } from '~/server/utils/errors'

export const MAX_INLINE_FILE_BYTES = 5 * 1024 * 1024
export const MAX_INLINE_BASE64_CHARS = Math.ceil(MAX_INLINE_FILE_BYTES / 3) * 4

export function isSafeUploadFileName(name: string): boolean {
  if (name.length === 0
    || name.length > 255
    || name.trim() !== name
    || name === '.'
    || name === '..'
    || name.includes('/')
    || name.includes('\\')) return false

  for (let index = 0; index < name.length; index++) {
    if (name.charCodeAt(index) <= 0x1f) return false
  }

  return true
}

export function decodeInlineBase64File(content: string): Buffer {
  if (content.length > MAX_INLINE_BASE64_CHARS) {
    throw new Bitrix24ToolError('The file exceeds the 5 MiB upload limit.', Bitrix24ErrorCode.INVALID_INPUT)
  }
  const padding = content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0
  if (Math.floor(content.length * 3 / 4) - padding > MAX_INLINE_FILE_BYTES) {
    throw new Bitrix24ToolError('The file exceeds the 5 MiB upload limit.', Bitrix24ErrorCode.INVALID_INPUT)
  }
  if (content.length === 0 || content.length % 4 !== 0) {
    throw new Bitrix24ToolError('File content must be standard Base64.', Bitrix24ErrorCode.INVALID_INPUT)
  }

  for (let index = 0; index < content.length; index++) {
    const code = content.charCodeAt(index)
    const isBase64Character = (code >= 65 && code <= 90)
      || (code >= 97 && code <= 122)
      || (code >= 48 && code <= 57)
      || code === 43
      || code === 47
    if (code === 61) {
      if (index < content.length - padding) {
        throw new Bitrix24ToolError('File content must be standard Base64.', Bitrix24ErrorCode.INVALID_INPUT)
      }
    }
    else if (!isBase64Character || index >= content.length - padding) {
      throw new Bitrix24ToolError('File content must be standard Base64.', Bitrix24ErrorCode.INVALID_INPUT)
    }
  }

  const bytes = Buffer.from(content, 'base64')
  if (bytes.length === 0) throw new Bitrix24ToolError('The file content must not be empty.', Bitrix24ErrorCode.INVALID_INPUT)
  if (bytes.length > MAX_INLINE_FILE_BYTES) {
    throw new Bitrix24ToolError('The file exceeds the 5 MiB upload limit.', Bitrix24ErrorCode.INVALID_INPUT)
  }
  if (bytes.toString('base64') !== content) {
    throw new Bitrix24ToolError('File content must be canonical standard Base64.', Bitrix24ErrorCode.INVALID_INPUT)
  }
  return bytes
}