import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitrix24ErrorCode } from '../../../../server/utils/errors'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

const fake = makeFakeBitrix24()
interface Input { folderId?: number, storageId?: number, limit: number, offset: number }
const tool = (await import('../../../../server/mcp/tools/disk/list-folder')).default as unknown as {
  handler: (input: Input) => Promise<{ content: { text: string }[] }>
}

describe('b24_disk_folder_list', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
  })

  it('selects folder or storage root endpoint and omits download URLs', async () => {
    fake.v2Call.mockResolvedValue(fakeOk([{ ID: '5', NAME: 'Notes.txt', TYPE: 'file', SIZE: '10', DOWNLOAD_URL: 'private' }]))
    const result = await tool.handler({ folderId: 3, limit: 20, offset: 0 })
    expect(fake.v2Call).toHaveBeenCalledWith({ method: 'disk.folder.getChildren', params: { id: 3, start: 0 } })
    expect(JSON.parse(result.content[0]!.text).entries[0]).toMatchObject({ id: 5, name: 'Notes.txt', type: 'file' })
    expect(result.content[0]!.text).not.toContain('DOWNLOAD_URL')

    fake.v2Call.mockReset()
    fake.v2Call.mockResolvedValue(fakeOk([]))
    await tool.handler({ storageId: 8, limit: 20, offset: 0 })
    expect(fake.v2Call).toHaveBeenCalledWith({ method: 'disk.storage.getChildren', params: { id: 8, start: 0 } })
  })

  it('requires exactly one container ID', async () => {
    await expect(tool.handler({ limit: 20, offset: 0 })).rejects.toMatchObject({ code: Bitrix24ErrorCode.INVALID_INPUT })
    await expect(tool.handler({ folderId: 1, storageId: 2, limit: 20, offset: 0 })).rejects.toMatchObject({ code: Bitrix24ErrorCode.INVALID_INPUT })
    expect(fake.v2Call).not.toHaveBeenCalled()
  })
})