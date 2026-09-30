import { z } from 'zod'
import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { useBitrix24Tenant } from '~/server/utils/bitrix24-tenant'
import { callV2 } from '~/server/utils/sdk-helpers'

interface StorageRow {
  ID?: string | number
  NAME?: string
  MODULE_ID?: string
  ENTITY_TYPE?: string
  ENTITY_ID?: string | number
  ROOT_OBJECT_ID?: string | number
}

function asId(value: string | number | undefined): number | null {
  const id = typeof value === 'string' ? Number.parseInt(value, 10) : value
  return Number.isSafeInteger(id) && Number(id) > 0 ? Number(id) : null
}

export default defineMcpTool({
  name: 'b24_disk_storage_list',
  description:
    'List Drive storages available to the authenticated Bitrix24 user. Returns compact storage metadata, never download URLs. Defaults to 20 storages (maximum 50); use nextOffset to continue.',
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(20).describe('Maximum storages to return (default 20, maximum 50).'),
    offset: z.number().int().nonnegative().default(0).describe('Bitrix24 result offset; use nextOffset to continue.'),
  },
  handler: async ({ limit, offset }) => {
    const b24 = useBitrix24Tenant()
    const raw = await callV2<StorageRow[]>(
      b24,
      'disk.storage.getList',
      { start: offset },
      'Failed to list Bitrix24 Drive storages',
    )
    const rows = raw ?? []
    const storages = rows.slice(0, limit).map(storage => ({
      id: asId(storage.ID),
      name: storage.NAME ?? null,
      module: storage.MODULE_ID ?? null,
      entityType: storage.ENTITY_TYPE ?? null,
      entityId: storage.ENTITY_ID ?? null,
      rootFolderId: asId(storage.ROOT_OBJECT_ID),
    }))
    const hasMore = rows.length > storages.length || rows.length >= 50

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          returned: storages.length,
          total: null,
          hasMore,
          ...(hasMore ? { nextOffset: offset + storages.length } : {}),
          storages,
        }),
      }],
    }
  },
})