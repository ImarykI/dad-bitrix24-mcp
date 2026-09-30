import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: <T,>(spec: T) => spec }))
const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))
const runtimeConfig: Record<string, unknown> = {
  bitrix24OauthEnabled: false,
  bitrix24WebhookUrl: 'https://portal.bitrix24.ru/rest/1/webhook-secret/',
}
vi.mock('~/server/utils/token-store', () => ({
  useTokenStore: () => ({ getTokens: () => ({ portalDomain: 'portal.bitrix24.ru' }) }),
}))
vi.stubGlobal('useRuntimeConfig', () => runtimeConfig)

const fake = makeFakeBitrix24()
const fetchMock = vi.fn<typeof globalThis.fetch>()
vi.stubGlobal('fetch', fetchMock)
const tool = (await import('../../../../server/mcp/tools/disk/read-file-text')).default as unknown as {
  handler: (input: { fileId: number }) => Promise<{ content: { text: string }[] }>
}

describe('b24_disk_file_text_read', () => {
  beforeEach(() => {
    fake.v2Call.mockReset()
    fetchMock.mockReset()
    useBitrix24Tenant.mockReset().mockReturnValue(fake.b24)
    runtimeConfig.bitrix24OauthEnabled = false
  })

  it('fetches bounded UTF-8 text only from the authenticated portal and returns no signed URL', async () => {
    fake.v2Call.mockResolvedValue(fakeOk({
      ID: '8', NAME: 'notes.md', SIZE: 5,
      DOWNLOAD_URL: 'https://portal.bitrix24.ru/rest/download.json?auth=secret&token=signed',
    }))
    fetchMock.mockResolvedValue(new Response('hello', { headers: { 'content-type': 'text/markdown', 'content-length': '5' } }))

    const result = await tool.handler({ fileId: 8 })

    expect(fake.v2Call).toHaveBeenCalledWith({ method: 'disk.file.get', params: { id: 8 } })
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ hostname: 'portal.bitrix24.ru' }), expect.objectContaining({ redirect: 'error' }))
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ fileId: 8, fileName: 'notes.md', content: 'hello', truncated: false })
    expect(result.content[0]!.text).not.toContain('secret')
  })

  it('rejects non-text formats and cross-origin URLs without fetching them', async () => {
    fake.v2Call.mockResolvedValue(fakeOk({ ID: '9', NAME: 'report.pdf', DOWNLOAD_URL: 'https://attacker.test/rest/download.json?auth=secret' }))
    await expect(tool.handler({ fileId: 9 })).rejects.toThrow(/unsupported file type/i)
    expect(fetchMock).not.toHaveBeenCalled()

    fake.v2Call.mockResolvedValue(fakeOk({ ID: '10', NAME: 'report.txt', DOWNLOAD_URL: 'https://attacker.test/rest/download.json?auth=secret' }))
    await expect(tool.handler({ fileId: 10 })).rejects.toThrow(/outside the authenticated portal/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects files over the metadata cap before downloading', async () => {
    fake.v2Call.mockResolvedValue(fakeOk({
      ID: '11', NAME: 'large.txt', SIZE: String(1024 * 1024 + 1),
      DOWNLOAD_URL: 'https://portal.bitrix24.ru/rest/download.json?auth=secret',
    }))
    await expect(tool.handler({ fileId: 11 })).rejects.toThrow(/1 MiB/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed rather than falling back to the webhook host in OAuth mode without tenant context', async () => {
    runtimeConfig.bitrix24OauthEnabled = true
    fake.v2Call.mockResolvedValue(fakeOk({
      ID: '12', NAME: 'notes.txt', SIZE: 5,
      DOWNLOAD_URL: 'https://portal.bitrix24.ru/rest/download.json?auth=secret',
    }))
    await expect(tool.handler({ fileId: 12 })).rejects.toThrow(/tenant context is missing/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})