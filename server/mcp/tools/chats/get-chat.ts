import { z } from 'zod'
import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { Bitrix24ErrorCode, Bitrix24ToolError } from '~/server/utils/errors'
import { useBitrix24Tenant } from '~/server/utils/bitrix24-tenant'
import { callV2 } from '~/server/utils/sdk-helpers'
import { truncateMcpText } from '~/server/utils/mcp-text'

interface DialogDetails {
  id?: number | string
  dialog_id?: string
  name?: string
  description?: string | null
  type?: string
  owner?: number | string
  user_counter?: number
  message_count?: number
  last_message_id?: number
  role?: string
  text_field_enabled?: boolean
  restrictions?: { send?: boolean }
  permissions?: { can_post?: string }
}

export default defineMcpTool({
  name: 'b24_chat_get',
  description:
    'Get compact details for a Bitrix24 dialog. `dialogId` accepts a numeric user ID for a private dialog, `chat123` for a group chat, or `sg123` for a workgroup chat. Returns title, type, membership/message counts, and send permission; no message history.',
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: {
    dialogId: z.string().trim().regex(/^(?:[1-9]\d*|chat[1-9]\d*|sg[1-9]\d*)$/).describe('Dialog identifier: numeric user ID, chat-prefixed group ID, or sg-prefixed workgroup ID.'),
  },
  handler: async ({ dialogId }) => {
    const b24 = useBitrix24Tenant()
    const dialog = await callV2<DialogDetails>(
      b24,
      'im.dialog.get',
      { DIALOG_ID: dialogId },
      'Failed to retrieve Bitrix24 dialog',
    )
    if (!dialog) {
      throw new Bitrix24ToolError(`Bitrix24 dialog ${dialogId} was not found or is not accessible.`, Bitrix24ErrorCode.INVALID_INPUT)
    }
    const description = typeof dialog.description === 'string'
      ? truncateMcpText(dialog.description, 500)
      : undefined

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          dialogId: dialog.dialog_id ?? dialogId,
          chatId: dialog.id ?? null,
          title: dialog.name ?? null,
          description: description?.text ?? null,
          descriptionTruncated: description?.truncated ?? false,
          type: dialog.type ?? null,
          ownerId: dialog.owner ?? null,
          participantCount: dialog.user_counter ?? null,
          messageCount: dialog.message_count ?? null,
          lastMessageId: dialog.last_message_id ?? null,
          currentUserRole: dialog.role ?? null,
          canSend: dialog.restrictions?.send ?? dialog.permissions?.can_post === 'member',
        }),
      }],
    }
  },
})