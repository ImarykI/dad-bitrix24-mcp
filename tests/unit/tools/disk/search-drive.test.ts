import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

const fake = makeFakeBitrix24()
interface Input { query: string, type: 'file' | 'folder' | 'all', storageId?: number, folderId?: number, limit: number, offset: number }
const tool = (await import('../../../../server/mcp/tools/disk/search-drive')).default as unknown as {
  inputSchema: { query: { safeParse: (value: unknown) => { success: boolean } } }
  handler: (input: Input) => Promise<{ content: { text: string }[] }>
}

describe('b24_disk_search', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
  })

  it('validates Bitrix24 query length and API offset bounds', () => {
    expect(tool.inputSchema.query.safeParse('ab').success).toBe(false)
    expect(tool.inputSchema.query.safeParse('report').success).toBe(true)
  })

  it('uses the verified query/filter fields and omits signed download URLs', async () => {
    fake.v2Call.mockResolvedValue(fakeOk(Array.from({ length: 50 }, (_, index) => ({
      ID: String(index + 9),
      NAME: index === 0 ? 'report.md' : `report-${index}.md`,
      TYPE: 'file',
      STORAGE_ID: '2',
      SIZE: '18',
      DOWNLOAD_URL: 'https://portal/rest/download?auth=secret',
    }))))
    const result = await tool.handler({ query: 'report', type: 'file', storageId: 2, folderId: 3, limit: 20, offset: 0 })
    expect(fake.v2Call).toHaveBeenCalledWith({
      method: 'disk.file.search',
      params: { QUERY: 'report', TYPE: 'file', FILTER: { STORAGE_ID: 2, FOLDER_ID: 3 }, start: 0 },
    })
    const payload = JSON.parse(result.content[0]!.text)
    expect(payload.nextOffset).toBe(20)
    expect(payload.results[0]).toMatchObject({ id: 9, name: 'report.md', type: 'file', sizeBytes: 18 })
    expect(result.content[0]!.text).not.toContain('DOWNLOAD_URL')
    expect(result.content[0]!.text).not.toContain('auth=secret')
  })
})