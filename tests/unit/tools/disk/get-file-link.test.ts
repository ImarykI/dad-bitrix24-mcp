import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitrix24ErrorCode } from '../../../../server/utils/errors'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

const fake = makeFakeBitrix24()
const tool = (await import('../../../../server/mcp/tools/disk/get-file-link')).default as unknown as {
  handler: (input: { fileId: number, confirmPublicLink: boolean }) => Promise<{ content: { text: string }[] }>
}

describe('b24_disk_file_link_get', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
  })

  it('requires public-share confirmation before calling Bitrix24', async () => {
    await expect(tool.handler({ fileId: 9, confirmPublicLink: false })).rejects.toMatchObject({ code: Bitrix24ErrorCode.INVALID_INPUT })
    expect(fake.v2Call).not.toHaveBeenCalled()
  })

  it('calls disk.file.getExternalLink and labels its public-access risk', async () => {
    fake.v2Call.mockResolvedValue(fakeOk('https://portal.bitrix24.ru/~public-code'))
    const result = await tool.handler({ fileId: 9, confirmPublicLink: true })
    expect(fake.v2Call).toHaveBeenCalledWith({ method: 'disk.file.getExternalLink', params: { id: 9 } })
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ fileId: 9, publicLink: 'https://portal.bitrix24.ru/~public-code' })
    expect(result.content[0]!.text).toMatch(/anyone with this link/i)
  })
})