import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

const fake = makeFakeBitrix24()
interface Input { dialogId: string, limit: number, lastMessageId?: number }
interface Content { content: { type: 'text', text: string }[] }
const tool = (await import('../../../../server/mcp/tools/chats/list-chat-messages')).default as unknown as {
  handler: (input: Input) => Promise<Content>
}

describe('b24_chat_message_list', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
  })

  it('uses LAST_ID pagination, sorts newest first, and omits attached file URLs', async () => {
    fake.v2Call.mockResolvedValue(fakeOk({ messages: [
      { id: 9, author_id: 2, text: 'old' },
      { id: 11, author_id: 0, text: 'system' },
      { id: 10, author_id: 4, text: 'x'.repeat(1500), params: { FILE_ID: [1] } },
    ] }))
    const result = await tool.handler({ dialogId: 'chat3', limit: 2, lastMessageId: 12 })
    expect(fake.v2Call).toHaveBeenCalledWith({
      method: 'im.dialog.messages.get',
      params: { DIALOG_ID: 'chat3', LIMIT: 2, LAST_ID: 12 },
    })
    const payload = JSON.parse(result.content[0]!.text)
    expect(payload.messages.map((message: { id: number }) => message.id)).toEqual([11, 10])
    expect(payload.nextLastMessageId).toBe(10)
    expect(payload.messages[1].text.length).toBeLessThanOrEqual(1200)
    expect(payload.messages[0].systemMessage).toBe(true)
    expect(payload.messages[1].hasFiles).toBe(true)
    expect(result.content[0]!.text).not.toContain('DOWNLOAD_URL')
  })

  it('omits the cursor on the first page and caps result count', async () => {
    fake.v2Call.mockResolvedValue(fakeOk({ messages: [{ id: 1, text: 'hello' }] }))
    const result = await tool.handler({ dialogId: '42', limit: 20 })
    expect(fake.v2Call).toHaveBeenCalledWith({
      method: 'im.dialog.messages.get',
      params: { DIALOG_ID: '42', LIMIT: 20 },
    })
    const payload = JSON.parse(result.content[0]!.text)
    expect(payload.messages).toHaveLength(1)
    expect(payload.nextLastMessageId).toBeUndefined()
  })
})