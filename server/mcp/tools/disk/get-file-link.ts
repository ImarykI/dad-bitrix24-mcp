import { z } from 'zod'
import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { Bitrix24ErrorCode, Bitrix24ToolError } from '~/server/utils/errors'
import { useBitrix24Tenant } from '~/server/utils/bitrix24-tenant'
import { callV2 } from '~/server/utils/sdk-helpers'

export default defineMcpTool({
  name: 'b24_disk_file_link_get',
  description:
    'Generate/get Bitrix24’s public link for a Drive file. This link may allow anyone who obtains it to access the file, and Bitrix24 does not report an expiry here. Before calling, confirm with the user that they intend to share this file publicly; set confirmPublicLink=true only after confirmation. Prefer b24_disk_file_get for private metadata.',
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  inputSchema: {
    fileId: z.number().int().positive().describe('Drive file ID.'),
    confirmPublicLink: z.boolean().describe('Required confirmation gate: set true only after the user approved creating/retrieving a public file link.'),
  },
  handler: async ({ fileId, confirmPublicLink }) => {
    if (!confirmPublicLink) {
      throw new Bitrix24ToolError(
        `Public link creation for Drive file ${fileId} was not confirmed. Ask the user whether anyone with the link may access this file.`,
        Bitrix24ErrorCode.INVALID_INPUT,
      )
    }
    const b24 = useBitrix24Tenant()
    const link = await callV2<string>(b24, 'disk.file.getExternalLink', { id: fileId }, 'Failed to obtain Bitrix24 public file link')
    if (typeof link !== 'string' || !link.startsWith('https://')) {
      throw new Bitrix24ToolError('Bitrix24 did not return a valid public file link.', Bitrix24ErrorCode.BITRIX24_ERROR)
    }
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ fileId, publicLink: link, warning: 'Anyone with this link may access the file; expiry is not reported.' }),
      }],
    }
  },
})