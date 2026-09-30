import { z } from 'zod'
import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { Bitrix24ErrorCode, Bitrix24ToolError } from '~/server/utils/errors'
import { useBitrix24Tenant } from '~/server/utils/bitrix24-tenant'
import { callV2 } from '~/server/utils/sdk-helpers'

interface DriveEntry {
  ID?: string | number
  NAME?: string
  TYPE?: string
  STORAGE_ID?: string | number
  PARENT_ID?: string | number
  SIZE?: string | number
  CREATE_TIME?: string
  UPDATE_TIME?: string
  DELETED_TYPE?: string | number
}

const positiveId = z.number().int().positive()

function asId(value: string | number | undefined): number | null {
  const id = typeof value === 'string' ? Number.parseInt(value, 10) : value
  return Number.isSafeInteger(id) && Number(id) > 0 ? Number(id) : null
}

export default defineMcpTool({
  name: 'b24_disk_folder_list',
  description:
    'List files and folders directly under a Drive folder, or at a storage root. Provide exactly one of folderId or storageId. Returns compact metadata only (no signed download URLs). Defaults to 20 entries, maximum 50; use nextOffset to continue.',
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: {
    folderId: positiveId.optional().describe('Folder whose direct children to list. Use storageId instead to list a storage root.'),
    storageId: positiveId.optional().describe('Storage whose root to list. Use folderId instead to list a nested folder.'),
    limit: z.number().int().min(1).max(50).default(20).describe('Maximum entries to return (default 20, maximum 50).'),
    offset: z.number().int().nonnegative().default(0).describe('Bitrix24 result offset; use nextOffset to continue.'),
  },
  handler: async ({ folderId, storageId, limit, offset }) => {
    if ((folderId === undefined) === (storageId === undefined)) {
      throw new Bitrix24ToolError('Provide exactly one of folderId or storageId.', Bitrix24ErrorCode.INVALID_INPUT)
    }

    const b24 = useBitrix24Tenant()
    const method = folderId !== undefined ? 'disk.folder.getChildren' : 'disk.storage.getChildren'
    const raw = await callV2<DriveEntry[]>(
      b24,
      method,
      { id: folderId ?? storageId, start: offset },
      'Failed to list Bitrix24 Drive folder contents',
    )
    const rows = raw ?? []
    const entries = rows.slice(0, limit).map(entry => ({
      id: asId(entry.ID),
      name: entry.NAME ?? null,
      type: entry.TYPE ?? null,
      storageId: asId(entry.STORAGE_ID),
      parentId: asId(entry.PARENT_ID),
      sizeBytes: entry.SIZE === undefined ? null : Number(entry.SIZE),
      createdAt: entry.CREATE_TIME ?? null,
      updatedAt: entry.UPDATE_TIME ?? null,
    }))
    const hasMore = rows.length > entries.length || rows.length >= 50

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          containerType: folderId !== undefined ? 'folder' : 'storage',
          containerId: folderId ?? storageId,
          returned: entries.length,
          total: null,
          hasMore,
          ...(hasMore ? { nextOffset: offset + entries.length } : {}),
          entries,
        }),
      }],
    }
  },
})