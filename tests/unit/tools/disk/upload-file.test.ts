import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitrix24ErrorCode } from '../../../../server/utils/errors'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

const fake = makeFakeBitrix24()
const tool = (await import('../../../../server/mcp/tools/disk/upload-file')).default as unknown as {
  handler: (input: { folderId: number, fileName: string, contentBase64: string, confirmUpload: boolean }) => Promise<{ content: { text: string }[] }>
}

describe('b24_disk_file_upload', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
  })

  it('requires upload confirmation and rejects malformed Base64 before REST calls', async () => {
    await expect(tool.handler({ folderId: 8, fileName: 'report.txt', contentBase64: 'aGVsbG8=', confirmUpload: false }))
      .rejects.toMatchObject({ code: Bitrix24ErrorCode.INVALID_INPUT })
    await expect(tool.handler({ folderId: 8, fileName: 'report.txt', contentBase64: 'bad!', confirmUpload: true }))
      .rejects.toThrow(/Base64/)
    expect(fake.v2Call).not.toHaveBeenCalled()
  })

  it('calls the documented upload method and omits credential-bearing URLs from output', async () => {
    fake.v2Call.mockResolvedValue(fakeOk({
      ID: '9', NAME: 'report.txt', PARENT_ID: '8', STORAGE_ID: '4', SIZE: '5',
      DOWNLOAD_URL: 'https://portal/rest/download.json?auth=secret&token=signed',
    }))
    const result = await tool.handler({ folderId: 8, fileName: 'report.txt', contentBase64: 'aGVsbG8=', confirmUpload: true })
    expect(fake.v2Call).toHaveBeenCalledWith({
      method: 'disk.folder.uploadFile',
      params: { id: 8, data: { NAME: 'report.txt' }, fileContent: ['report.txt', 'aGVsbG8='] },
    })
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ uploaded: true, file: { id: 9, sizeBytes: 5 } })
    expect(result.content[0]!.text).not.toContain('secret')
    expect(result.content[0]!.text).not.toContain('DOWNLOAD_URL')
  })
})