import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

const fake = makeFakeBitrix24()
const tool = (await import('../../../../server/mcp/tools/disk/get-file')).default as unknown as {
  handler: (input: { fileId: number }) => Promise<{ content: { text: string }[] }>
}

describe('b24_disk_file_get', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
  })

  it('calls disk.file.get and never returns DOWNLOAD_URL', async () => {
    fake.v2Call.mockResolvedValue(fakeOk({
      ID: '9', NAME: 'report.txt', TYPE: 'file', SIZE: '12',
      DOWNLOAD_URL: 'https://portal.bitrix24.ru/rest/download.json?auth=secret&token=signed',
    }))
    const result = await tool.handler({ fileId: 9 })
    expect(fake.v2Call).toHaveBeenCalledWith({ method: 'disk.file.get', params: { id: 9 } })
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ id: 9, name: 'report.txt', sizeBytes: 12 })
    expect(result.content[0]!.text).not.toContain('DOWNLOAD_URL')
    expect(result.content[0]!.text).not.toContain('auth=')
    expect(useBitrix24Tenant).toHaveBeenCalledTimes(1)
  })
})