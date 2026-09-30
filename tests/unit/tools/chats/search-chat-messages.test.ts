import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitrix24ErrorCode } from '../../../../server/utils/errors'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

const fake = makeFakeBitrix24()
interface Input { dialogId: string, query: string, limit: number, lastMessageId?: number }
interface Content { content: { type: 'text', text: string }[] }
const tool = (await import('../../../../server/mcp/tools/chats/search-chat-messages')).default as unknown as {
  handler: (input: Input) => Promise<Content>
}

describe('b24_chat_message_search', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
  })

  it('resolves DIALOG_ID to CHAT_ID and searches with a bounded page', async () => {
    fake.v2Call
      .mockResolvedValueOnce(fakeOk({ id: 321 }))
      .mockResolvedValueOnce(fakeOk({ messages: [
        { id: 8, authorId: 0, isSystem: true, text: 'system' },
        { id: 9, authorId: 4, text: 'match ' + 'x'.repeat(1300) },
      ] }))

    const result = await tool.handler({ dialogId: 'chat321', query: 'match', limit: 1, lastMessageId: 10 })

    expect(fake.v2Call).toHaveBeenNthCalledWith(1, {
      method: 'im.dialog.get', params: { DIALOG_ID: 'chat321' },
    })
    expect(fake.v2Call).toHaveBeenNthCalledWith(2, {
      method: 'im.dialog.messages.search',
      params: { CHAT_ID: 321, SEARCH_MESSAGE: 'match', ORDER: { ID: 'DESC' }, LIMIT: 1, LAST_ID: 10 },
    })
    const payload = JSON.parse(result.content[0]!.text)
    expect(payload.messages[0].id).toBe(9)
    expect(payload.messages[0].text.length).toBeLessThanOrEqual(1200)
    expect(payload.nextLastMessageId).toBe(9)
  })

  it('rejects inaccessible dialog and preserves Bitrix24 search error codes', async () => {
    fake.v2Call.mockResolvedValueOnce(fakeOk(undefined))
    await expect(tool.handler({ dialogId: '404', query: 'x', limit: 20 })).rejects.toMatchObject({
      code: Bitrix24ErrorCode.INVALID_INPUT,
    })

    fake.v2Call.mockReset()
    fake.v2Call.mockResolvedValueOnce(fakeOk({ id: 321 }))
    fake.v2Call.mockRejectedValueOnce(Object.assign(new Error('ACCESS_ERROR'), { code: 'ACCESS_ERROR' }))
    await expect(tool.handler({ dialogId: 'chat321', query: 'x', limit: 20 })).rejects.toMatchObject({
      name: 'Bitrix24ToolError',
      code: 'ACCESS_ERROR',
    })
  })
})