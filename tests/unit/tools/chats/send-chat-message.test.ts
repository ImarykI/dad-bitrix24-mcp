import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitrix24ErrorCode } from '../../../../server/utils/errors'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

const fake = makeFakeBitrix24()
interface Content { content: { type: 'text', text: string }[] }
interface Input { dialogId: string, message: string, replyToId?: number, confirmSend: boolean }
const tool = (await import('../../../../server/mcp/tools/chats/send-chat-message')).default as unknown as {
  inputSchema: { dialogId: { safeParse: (value: unknown) => { success: boolean } }, message: { safeParse: (value: unknown) => { success: boolean } } }
  handler: (input: Input) => Promise<Content>
}

describe('b24_chat_message_send', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
  })

  it('validates dialog ID and the message-size bound', () => {
    expect(tool.inputSchema.dialogId.safeParse('chat12').success).toBe(true)
    expect(tool.inputSchema.dialogId.safeParse('https://other.test').success).toBe(false)
    expect(tool.inputSchema.message.safeParse('hello').success).toBe(true)
    expect(tool.inputSchema.message.safeParse('x'.repeat(5001)).success).toBe(false)
  })

  it('requires recipient/content confirmation before sending', async () => {
    await expect(tool.handler({ dialogId: 'chat12', message: 'hello', confirmSend: false })).rejects.toMatchObject({
      name: 'Bitrix24ToolError', code: Bitrix24ErrorCode.INVALID_INPUT,
    })
    expect(fake.v2Call).not.toHaveBeenCalled()
  })

  it('sends as the current tenant user and includes a same-dialog reply ID when supplied', async () => {
    fake.v2Call.mockResolvedValue(fakeOk(9001))
    const result = await tool.handler({ dialogId: 'chat12', message: 'Confirmed message', replyToId: 123, confirmSend: true })
    expect(useBitrix24Tenant).toHaveBeenCalledTimes(1)
    expect(fake.v2Call).toHaveBeenCalledWith({
      method: 'im.message.add',
      params: { DIALOG_ID: 'chat12', MESSAGE: 'Confirmed message', REPLY_ID: 123 },
    })
    expect(JSON.parse(result.content[0]!.text)).toEqual({ sent: true, dialogId: 'chat12', messageId: 9001 })
  })
})