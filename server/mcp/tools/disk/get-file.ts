import { z } from 'zod'
import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { Bitrix24ErrorCode, Bitrix24ToolError } from '~/server/utils/errors'
import { useBitrix24Tenant } from '~/server/utils/bitrix24-tenant'
import { callV2 } from '~/server/utils/sdk-helpers'

interface DriveFile {
  ID?: string | number
  NAME?: string
  CODE?: string | null
  STORAGE_ID?: string | number
  TYPE?: string
  PARENT_ID?: string | number
  SIZE?: string | number
  CREATE_TIME?: string
  UPDATE_TIME?: string
  CREATED_BY?: string | number
  UPDATED_BY?: string | number
  DETAIL_URL?: string
}

function asId(value: string | number | undefined): number | null {
  const id = typeof value === 'string' ? Number.parseInt(value, 10) : value
  return Number.isSafeInteger(id) && Number(id) > 0 ? Number(id) : null
}

export default defineMcpTool({
  name: 'b24_disk_file_get',
  description:
    'Get metadata for a Bitrix24 Drive file by ID. Returns name, size, storage/folder IDs, timestamps, and UI path; it deliberately omits DOWNLOAD_URL because that field contains a credential-bearing link.',
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: {
    fileId: z.number().int().positive().describe('Drive file ID from b24_disk_search or b24_disk_folder_list.'),
  },
  handler: async ({ fileId }) => {
    const b24 = useBitrix24Tenant()
    const file = await callV2<DriveFile>(b24, 'disk.file.get', { id: fileId }, 'Failed to retrieve Bitrix24 Drive file metadata')
    if (!file) {
      throw new Bitrix24ToolError(`Bitrix24 Drive file ${fileId} was not found or is not accessible.`, Bitrix24ErrorCode.INVALID_INPUT)
    }
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          id: asId(file.ID),
          name: file.NAME ?? null,
          code: file.CODE ?? null,
          storageId: asId(file.STORAGE_ID),
          type: file.TYPE ?? null,
          parentId: asId(file.PARENT_ID),
          sizeBytes: file.SIZE === undefined ? null : Number(file.SIZE),
          createdAt: file.CREATE_TIME ?? null,
          updatedAt: file.UPDATE_TIME ?? null,
          createdBy: asId(file.CREATED_BY),
          updatedBy: asId(file.UPDATED_BY),
          detailUrl: file.DETAIL_URL ?? null,
        }),
      }],
    }
  },
})