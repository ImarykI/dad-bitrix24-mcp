import { z } from 'zod'
import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { Bitrix24ErrorCode, Bitrix24ToolError } from '~/server/utils/errors'
import { useBitrix24Tenant } from '~/server/utils/bitrix24-tenant'
import { callV2 } from '~/server/utils/sdk-helpers'
import { isSafeUploadFileName } from '~/server/utils/base64-file'

interface CreatedFolder {
  ID?: string | number
  NAME?: string
  STORAGE_ID?: string | number
  PARENT_ID?: string | number
  DETAIL_URL?: string
}

function asId(value: string | number | undefined): number | null {
  const id = typeof value === 'string' ? Number.parseInt(value, 10) : value
  return Number.isSafeInteger(id) && Number(id) > 0 ? Number(id) : null
}

export default defineMcpTool({
  name: 'b24_disk_folder_create',
  description:
    'Create a subfolder in Bitrix24 Drive as the authenticated user. Before calling, confirm the exact parent folder and folder name with the user; set confirmCreate=true only after confirmation. Folder names must be plain names (no path separators).',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: {
    parentFolderId: z.number().int().positive().describe('Existing Drive folder ID where the new folder will be created.'),
    name: z.string().refine(isSafeUploadFileName).describe('New folder name (1–255 characters; no path separators, surrounding whitespace, or control characters).'),
    confirmCreate: z.boolean().describe('Required confirmation gate. Set true only after the user confirmed this parent folder and new folder name.'),
  },
  handler: async ({ parentFolderId, name, confirmCreate }) => {
    if (!confirmCreate) {
      throw new Bitrix24ToolError(
        `Creating folder ${name} under Drive folder ${parentFolderId} was not confirmed. Ask the user to confirm the destination and name first.`,
        Bitrix24ErrorCode.INVALID_INPUT,
      )
    }
    const b24 = useBitrix24Tenant()
    const folder = await callV2<CreatedFolder>(
      b24,
      'disk.folder.addSubFolder',
      { id: parentFolderId, data: { NAME: name } },
      'Failed to create Bitrix24 Drive folder',
    )
    if (!folder?.ID) {
      throw new Bitrix24ToolError('Bitrix24 did not return the created folder ID.', Bitrix24ErrorCode.BITRIX24_ERROR)
    }
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          created: true,
          id: asId(folder.ID),
          name: folder.NAME ?? name,
          parentFolderId: asId(folder.PARENT_ID) ?? parentFolderId,
          storageId: asId(folder.STORAGE_ID),
          detailUrl: folder.DETAIL_URL ?? null,
        }),
      }],
    }
  },
})