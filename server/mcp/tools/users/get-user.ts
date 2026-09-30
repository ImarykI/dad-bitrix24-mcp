import { z } from 'zod'
import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { useBitrix24Tenant } from '~/server/utils/bitrix24-tenant'
import { Bitrix24ErrorCode, Bitrix24ToolError } from '~/server/utils/errors'
import { callV2 } from '~/server/utils/sdk-helpers'

interface UserRow {
  ID?: string | number
  NAME?: string
  LAST_NAME?: string
  SECOND_NAME?: string
  WORK_POSITION?: string
  UF_DEPARTMENT?: number[]
}

function parseId(id: string | number | undefined): number | null {
  if (id === undefined) return null
  const parsed = typeof id === 'string' ? Number.parseInt(id, 10) : id
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export default defineMcpTool({
  name: 'b24_user_get',
  description:
    'Get a Bitrix24 user by numeric ID. Use `b24_user_find` first when the user is known by name. Returns only id, name, position, and department IDs; unavailable personal fields are not requested.',
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: {
    userId: z.number().int().positive().describe('Numeric Bitrix24 user ID to retrieve.'),
  },
  handler: async ({ userId }) => {
    const b24 = useBitrix24Tenant()
    const users = await callV2<UserRow[]>(
      b24,
      'user.get',
      {
        filter: { ID: userId },
        select: ['ID', 'NAME', 'LAST_NAME', 'SECOND_NAME', 'WORK_POSITION', 'UF_DEPARTMENT'],
        start: 0,
      },
      'Failed to retrieve Bitrix24 user',
    ) ?? []

    const user = users[0]
    const id = parseId(user?.ID)
    if (!user || id !== userId) {
      throw new Bitrix24ToolError(`Bitrix24 user ${userId} was not found.`, Bitrix24ErrorCode.INVALID_INPUT)
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          id,
          firstName: user.NAME || null,
          lastName: user.LAST_NAME || null,
          secondName: user.SECOND_NAME || null,
          position: user.WORK_POSITION || null,
          departmentIds: user.UF_DEPARTMENT ?? [],
        }),
      }],
    }
  },
})