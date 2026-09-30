import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

const fake = makeFakeBitrix24()
interface Input { query: string, chatLimit: number, chatOffset: number, limit: number }
interface Content { content: { type: 'text', text: string }[] }
const tool = (await import('../../../../server/mcp/tools/chats/search-recent-chat-messages')).default as unknown as {
  handler: (input: Input) => Promise<Content>
}

describe('b24_chat_recent_search', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    fake.v2Batch.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
  })

  it('searches recent chats with one bounded batch and groups hits by dialog', async () => {
    fake.v2Call.mockResolvedValue(fakeOk({
      items: [
        { id: 'chat12', chat_id: 12, title: 'Planning' },
        { id: 'chat13', chat_id: 13, title: 'Launch' },
      ],
      hasMore: true,
    }))
    fake.v2Batch.mockResolvedValue({
      isSuccess: true,
      getData: () => [
        fakeOk({ messages: [{ id: 8, authorId: 2, text: 'first hit' }] }),
        fakeOk({ messages: [{ id: 9, authorId: 3, text: 'second hit' }] }),
      ],
      getErrorMessages: () => [],
    })

    const result = await tool.handler({ query: 'plan', chatLimit: 10, chatOffset: 0, limit: 20 })

    expect(fake.v2Call).toHaveBeenCalledWith({
      method: 'im.recent.list', params: { OFFSET: 0, LIMIT: 10, SKIP_OPENLINES: 'Y' },
    })
    const batchArgs = fake.v2Batch.mock.calls[0]![0] as unknown as { calls: Array<[string, Record<string, unknown>]> }
    expect(batchArgs.calls).toHaveLength(2)
    expect(batchArgs.calls.every(call => call[0] === 'im.dialog.messages.search')).toBe(true)
    const payload = JSON.parse(result.content[0]!.text)
    expect(payload.nextChatOffset).toBe(10)
    expect(payload.messages.map((chat: { dialogId: string }) => chat.dialogId)).toEqual(['chat12', 'chat13'])
  })

  it('caps the aggregate output and handles an empty recent-chat list without batching', async () => {
    fake.v2Call.mockResolvedValue(fakeOk({ items: [], hasMore: false }))
    const result = await tool.handler({ query: 'x', chatLimit: 10, chatOffset: 0, limit: 20 })
    expect(fake.v2Batch).not.toHaveBeenCalled()
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ chatsSearched: 0, returned: 0, messages: [] })
  })
})