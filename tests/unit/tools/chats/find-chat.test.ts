import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

const fake = makeFakeBitrix24()
interface Input { query: string, limit: number, offset: number }
interface Content { content: { type: 'text', text: string }[] }
const tool = (await import('../../../../server/mcp/tools/chats/find-chat')).default as unknown as {
  inputSchema: { query: { safeParse: (value: unknown) => { success: boolean } } }
  handler: (input: Input) => Promise<Content>
}

describe('b24_chat_find', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
  })

  it('uses im.search.chat.list with a bounded page and formats dialog IDs', async () => {
    fake.v2Call.mockResolvedValue(fakeOk({
      result: [
        { id: 12, name: 'Planning', type: 'chat', user_counter: 5 },
        { id: 30, name: 'Project', type: 'sonetGroup', entity_type: 'SONET_GROUP', entity_id: '7' },
      ],
      total: 51,
      next: 20,
    }))

    const result = await tool.handler({ query: 'plan', limit: 20, offset: 0 })

    expect(fake.v2Call).toHaveBeenCalledWith({
      method: 'im.search.chat.list',
      params: { FIND: 'plan', OFFSET: 0, LIMIT: 20 },
    })
    const payload = JSON.parse(result.content[0]!.text)
    expect(payload.nextOffset).toBe(20)
    expect(payload.chats.map((chat: { dialogId: string }) => chat.dialogId)).toEqual(['chat12', 'sg7'])
  })

  it('rejects search strings shorter than Bitrix24 minimum', () => {
    expect(tool.inputSchema.query.safeParse('a').success).toBe(false)
  })

  it('preserves Bitrix24 search errors through callV2', async () => {
    fake.v2Call.mockRejectedValue(Object.assign(new Error('FIND_SHORT'), { code: 'FIND_SHORT' }))
    await expect(tool.handler({ query: 'ok', limit: 20, offset: 0 })).rejects.toMatchObject({
      name: 'Bitrix24ToolError',
      code: 'FIND_SHORT',
    })
  })
})