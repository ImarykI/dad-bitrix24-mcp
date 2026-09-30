import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitrix24ErrorCode } from '../../../../server/utils/errors'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

const fake = makeFakeBitrix24()
interface Input { dialogId: string, fileName: string, contentBase64: string, message?: string, confirmSend: boolean }
interface Content { content: { type: 'text', text: string }[] }
const tool = (await import('../../../../server/mcp/tools/chats/send-chat-file')).default as unknown as {
  inputSchema: { fileName: { safeParse: (value: unknown) => { success: boolean } } }
  handler: (input: Input) => Promise<Content>
}

describe('b24_chat_file_send', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
  })

  it('rejects paths, empty content, and uploads above 5 MiB', async () => {
    expect(tool.inputSchema.fileName.safeParse('../report.txt').success).toBe(false)
    await expect(tool.handler({ dialogId: 'chat1', fileName: 'x.txt', contentBase64: '', confirmSend: true })).rejects.toMatchObject({ code: Bitrix24ErrorCode.INVALID_INPUT })
    const oversize = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')
    await expect(tool.handler({ dialogId: 'chat1', fileName: 'x.txt', contentBase64: oversize, confirmSend: true })).rejects.toThrow(/5 MiB/)
    expect(fake.v2Call).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation before sending the file', async () => {
    await expect(tool.handler({ dialogId: 'chat1', fileName: 'report.txt', contentBase64: 'aGVsbG8=', confirmSend: false }))
      .rejects.toMatchObject({ code: Bitrix24ErrorCode.INVALID_INPUT })
    expect(fake.v2Call).not.toHaveBeenCalled()
  })

  it('uses im.v2.File.upload and returns safe metadata without signed URLs', async () => {
    fake.v2Call.mockResolvedValue(fakeOk({
      dialogId: 'chat1', chatId: 1, messageId: 9,
      file: { id: 8, name: 'report.txt', size: 5, type: 'file', urlDownload: 'https://portal/rest/download?auth=secret' },
    }))
    const result = await tool.handler({ dialogId: 'chat1', fileName: 'report.txt', contentBase64: 'aGVsbG8=', message: 'Confirmed', confirmSend: true })
    expect(useBitrix24Tenant).toHaveBeenCalledTimes(1)
    expect(fake.v2Call).toHaveBeenCalledWith({
      method: 'im.v2.File.upload',
      params: { dialogId: 'chat1', fields: { name: 'report.txt', content: 'aGVsbG8=', message: 'Confirmed' } },
    })
    expect(result.content[0]!.text).not.toContain('download')
    expect(result.content[0]!.text).not.toContain('secret')
  })
})