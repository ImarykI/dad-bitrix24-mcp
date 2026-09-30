import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

const fake = makeFakeBitrix24()
const tool = (await import('../../../../server/mcp/tools/disk/list-storage')).default as unknown as {
  handler: (input: { limit: number, offset: number }) => Promise<{ content: { text: string }[] }>
}

describe('b24_disk_storage_list', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
  })

  it('lists with disk.storage.getList and returns compact metadata plus next offset', async () => {
    fake.v2Call.mockResolvedValue(fakeOk(Array.from({ length: 50 }, (_, index) => ({
      ID: String(index + 7),
      NAME: index === 0 ? 'My Drive' : `Drive ${index}`,
      ENTITY_TYPE: 'user',
      ROOT_OBJECT_ID: '9',
      secret: 'omit',
    }))))
    const result = await tool.handler({ limit: 20, offset: 20 })
    expect(fake.v2Call).toHaveBeenCalledWith({ method: 'disk.storage.getList', params: { start: 20 } })
    const payload = JSON.parse(result.content[0]!.text)
    expect(payload.nextOffset).toBe(40)
    expect(payload.storages[0]).toEqual({ id: 7, name: 'My Drive', module: null, entityType: 'user', entityId: null, rootFolderId: 9 })
    expect(result.content[0]!.text).not.toContain('secret')
  })
})