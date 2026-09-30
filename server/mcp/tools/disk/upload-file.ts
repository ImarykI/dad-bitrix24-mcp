import { z } from 'zod'
import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { Bitrix24ErrorCode, Bitrix24ToolError } from '~/server/utils/errors'
import { useBitrix24Tenant } from '~/server/utils/bitrix24-tenant'
import { callV2 } from '~/server/utils/sdk-helpers'
import { decodeInlineBase64File, isSafeUploadFileName, MAX_INLINE_BASE64_CHARS } from '~/server/utils/base64-file'

interface UploadedFile {
  ID?: string | number
  NAME?: string
  STORAGE_ID?: string | number
  PARENT_ID?: string | number
  SIZE?: string | number
  TYPE?: string
  DETAIL_URL?: string
}

function asId(value: string | number | undefined): number | null {
  const id = typeof value === 'string' ? Number.parseInt(value, 10) : value
  return Number.isSafeInteger(id) && Number(id) > 0 ? Number(id) : null
}

export default defineMcpTool({
  name: 'b24_disk_file_upload',
  description:
    'Upload a file to a Bitrix24 Drive folder as the authenticated user. Before calling, confirm the destination folder, filename, and exact content with the user; set confirmUpload=true only after confirmation. Accepts standard Base64 up to 5 MiB. Does not return signed DOWNLOAD_URL values.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: {
    folderId: z.number().int().positive().describe('Existing Drive folder ID to receive this file.'),
    fileName: z.string().refine(isSafeUploadFileName).describe('File name with extension; no path separators, surrounding whitespace, or control characters.'),
    contentBase64: z.string().min(4).max(MAX_INLINE_BASE64_CHARS).describe('Standard padded Base64 content, maximum 5 MiB after decoding.'),
    confirmUpload: z.boolean().describe('Required confirmation gate. Set true only after the user confirmed destination folder, filename, and content.'),
  },
  handler: async ({ folderId, fileName, contentBase64, confirmUpload }) => {
    if (!confirmUpload) {
      throw new Bitrix24ToolError(
        `Uploading ${fileName} to Drive folder ${folderId} was not confirmed. Ask the user to confirm the destination and exact file first.`,
        Bitrix24ErrorCode.INVALID_INPUT,
      )
    }
    const bytes = decodeInlineBase64File(contentBase64)
    const b24 = useBitrix24Tenant()
    const file = await callV2<UploadedFile>(
      b24,
      'disk.folder.uploadFile',
      { id: folderId, data: { NAME: fileName }, fileContent: [fileName, contentBase64] },
      'Failed to upload file to Bitrix24 Drive',
    )
    if (!file?.ID) {
      throw new Bitrix24ToolError('Bitrix24 did not return the uploaded file ID.', Bitrix24ErrorCode.BITRIX24_ERROR)
    }
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          uploaded: true,
          file: {
            id: asId(file.ID),
            name: file.NAME ?? fileName,
            storageId: asId(file.STORAGE_ID),
            folderId: asId(file.PARENT_ID) ?? folderId,
            sizeBytes: file.SIZE === undefined ? bytes.length : Number(file.SIZE),
            type: file.TYPE ?? null,
            detailUrl: file.DETAIL_URL ?? null,
          },
        }),
      }],
    }
  },
})