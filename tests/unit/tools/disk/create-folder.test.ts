import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitrix24ErrorCode } from '../../../../server/utils/errors'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

const fake = makeFakeBitrix24()
const tool = (await import('../../../../server/mcp/tools/disk/create-folder')).default as unknown as {
  handler: (input: { parentFolderId: number, name: string, confirmCreate: boolean }) => Promise<{ content: { text: string }[] }>
}

describe('b24_disk_folder_create', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
  })

  it('requires confirmation before the write', async () => {
    await expect(tool.handler({ parentFolderId: 8, name: 'Notes', confirmCreate: false })).rejects.toMatchObject({ code: Bitrix24ErrorCode.INVALID_INPUT })
    expect(fake.v2Call).not.toHaveBeenCalled()
  })

  it('calls disk.folder.addSubFolder using the current tenant and returns safe metadata', async () => {
    fake.v2Call.mockResolvedValue(fakeOk({ ID: '9', NAME: 'Notes', PARENT_ID: '8', STORAGE_ID: '4', DOWNLOAD_URL: 'omit' }))
    const result = await tool.handler({ parentFolderId: 8, name: 'Notes', confirmCreate: true })
    expect(useBitrix24Tenant).toHaveBeenCalledTimes(1)
    expect(fake.v2Call).toHaveBeenCalledWith({ method: 'disk.folder.addSubFolder', params: { id: 8, data: { NAME: 'Notes' } } })
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ created: true, id: 9, parentFolderId: 8 })
    expect(result.content[0]!.text).not.toContain('DOWNLOAD_URL')
  })
})