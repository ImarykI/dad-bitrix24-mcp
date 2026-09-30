import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

const fake = makeFakeBitrix24()
interface Input { limit: number, offset: number, includeOpenLines: boolean }
interface Content { content: { type: 'text', text: string }[] }
const tool = (await import('../../../../server/mcp/tools/chats/recent-chat')).default as unknown as {
  handler: (input: Input) => Promise<Content>
}

describe('b24_chat_recent', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
  })

  it('calls im.recent.list with a bounded page and omits file URLs from results', async () => {
    fake.v2Call.mockResolvedValue(fakeOk({
      items: [{
        id: 'chat123', chat_id: 123, type: 'chat', title: 'Project', counter: 2,
        message: { id: 90, text: 'hello', file: true, date: '2026-09-30T12:00:00Z' },
      }],
      hasMore: true,
    }))

    const result = await tool.handler({ limit: 20, offset: 0, includeOpenLines: false })

    expect(fake.v2Call).toHaveBeenCalledWith({
      method: 'im.recent.list',
      params: { OFFSET: 0, LIMIT: 20, SKIP_OPENLINES: 'Y' },
    })
    const payload = JSON.parse(result.content[0]!.text)
    expect(payload.nextOffset).toBe(20)
    expect(payload.dialogs[0]).toMatchObject({ dialogId: 'chat123', chatId: 123, hasFiles: true })
    expect(result.content[0]!.text).not.toContain('DOWNLOAD_URL')
  })

  it('truncates long last-message content and includes Open Lines only when requested', async () => {
    fake.v2Call.mockResolvedValue(fakeOk({
      items: [{ id: 42, message: { text: 'x'.repeat(900) } }],
      hasMore: false,
    }))

    const result = await tool.handler({ limit: 50, offset: 50, includeOpenLines: true })
    expect(fake.v2Call).toHaveBeenCalledWith({
      method: 'im.recent.list',
      params: { OFFSET: 50, LIMIT: 50, SKIP_OPENLINES: 'N' },
    })
    const payload = JSON.parse(result.content[0]!.text)
    expect(payload.hasMore).toBe(false)
    expect(payload.dialogs[0].lastMessage.length).toBeLessThanOrEqual(600)
    expect(payload.dialogs[0].lastMessageTruncated).toBe(true)
    expect(payload.nextOffset).toBeUndefined()
  })
})