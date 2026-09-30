import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitrix24ErrorCode } from '../../../../server/utils/errors'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

const fake = makeFakeBitrix24()
interface Content { content: { type: 'text', text: string }[] }
const tool = (await import('../../../../server/mcp/tools/chats/get-chat')).default as unknown as {
  inputSchema: { dialogId: { safeParse: (value: unknown) => { success: boolean } } }
  handler: (input: { dialogId: string }) => Promise<Content>
}

describe('b24_chat_get', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
  })

  it('accepts supported dialogId forms and rejects invalid values', () => {
    for (const value of ['42', 'chat123', 'sg7']) expect(tool.inputSchema.dialogId.safeParse(value).success).toBe(true)
    for (const value of ['', 'chat0', 'https://portal.example']) expect(tool.inputSchema.dialogId.safeParse(value).success).toBe(false)
  })

  it('calls im.dialog.get and returns only bounded details', async () => {
    fake.v2Call.mockResolvedValue(fakeOk({
      id: 123, dialog_id: 'chat123', name: 'Project chat', description: 'x'.repeat(700),
      type: 'chat', owner: 7, user_counter: 5, message_count: 80, last_message_id: 900,
      role: 'MEMBER', restrictions: { send: true },
    }))
    const result = await tool.handler({ dialogId: 'chat123' })
    expect(fake.v2Call).toHaveBeenCalledWith({ method: 'im.dialog.get', params: { DIALOG_ID: 'chat123' } })
    const payload = JSON.parse(result.content[0]!.text)
    expect(payload).toMatchObject({ dialogId: 'chat123', chatId: 123, title: 'Project chat', canSend: true })
    expect(payload.description.length).toBeLessThanOrEqual(500)
    expect(payload.descriptionTruncated).toBe(true)
  })

  it('returns a clear missing/inaccessible dialog error', async () => {
    fake.v2Call.mockResolvedValue(fakeOk(undefined))
    await expect(tool.handler({ dialogId: '404' })).rejects.toMatchObject({
      name: 'Bitrix24ToolError',
      code: Bitrix24ErrorCode.INVALID_INPUT,
    })
  })

  it('keeps Bitrix24 ACCESS_ERROR mapping', async () => {
    fake.v2Call.mockRejectedValue(Object.assign(new Error('ACCESS_ERROR'), { code: 'ACCESS_ERROR' }))
    await expect(tool.handler({ dialogId: 'chat123' })).rejects.toMatchObject({
      name: 'Bitrix24ToolError',
      code: 'ACCESS_ERROR',
    })
  })
})