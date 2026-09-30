import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as AuditLogModule from '~/server/utils/audit-log'
import type * as TokenStoreModule from '~/server/utils/token-store'
import { createTokenStore, type TokenStore } from '~/server/utils/token-store'

const runtimeConfig: Record<string, unknown> = {
  bitrix24OauthEnabled: true,
  bitrix24OauthClientId: 'b24-app-id',
  bitrix24OauthClientSecret: 'not-used-by-test',
  bitrix24OauthRedirectUrl: 'https://mcp.example.com/api/oauth/callback',
  bitrix24OauthScope: 'user,task,im,disk',
  bitrix24Portal: '',
}
vi.stubGlobal('useRuntimeConfig', () => runtimeConfig)

const { recordAuditEvent } = vi.hoisted(() => ({
  recordAuditEvent: vi.fn<(event: Parameters<typeof AuditLogModule.recordAuditEvent>[0]) => Promise<void>>(async () => undefined),
}))
vi.mock('~/server/utils/audit-log', async () => {
  const real = await vi.importActual<typeof AuditLogModule>('~/server/utils/audit-log')
  return { ...real, recordAuditEvent }
})

let db: Database.Database
let store: TokenStore
vi.mock('~/server/utils/token-store', async () => {
  const real = await vi.importActual<typeof TokenStoreModule>('~/server/utils/token-store')
  return { ...real, useTokenStore: () => store }
})

interface CapturedResponse {
  statusCode: number
  headers: Record<string, string | string[]>
  body: string
}

async function callHandler(query: Record<string, string>, cookie?: string): Promise<CapturedResponse> {
  const handler = (await import('~/server/api/oauth/authorize.get')).default
  const { createApp, eventHandler, toNodeListener } = await import('h3')
  const app = createApp({ onError: (err, event) => {
    const error = err as { statusCode?: number; statusMessage?: string; data?: unknown }
    event.node.res.statusCode = error.statusCode ?? 500
    event.node.res.setHeader('content-type', 'application/json')
    event.node.res.end(JSON.stringify({ statusMessage: error.statusMessage, data: error.data }))
  } })
  app.use('/api/oauth/authorize', eventHandler(handler))

  const req = new IncomingMessage(new Socket())
  req.method = 'GET'
  req.url = `/api/oauth/authorize?${new URLSearchParams(query).toString()}`
  req.headers = { host: 'mcp.example.com', ...(cookie ? { cookie } : {}) }
  const res = new ServerResponse(req)
  const chunks: Buffer[] = []
  const originalWrite = res.write.bind(res)
  res.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    return originalWrite(chunk as never, ...rest as never[])
  }) as typeof res.write
  const originalEnd = res.end.bind(res)

  const result = new Promise<CapturedResponse>((resolve) => {
    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
      const endResult = originalEnd(chunk as never, ...rest as never[])
      const headers: Record<string, string | string[]> = {}
      for (const name of res.getHeaderNames()) {
        const value = res.getHeader(name)
        if (value !== undefined) headers[name] = value as string | string[]
      }
      resolve({ statusCode: res.statusCode, headers, body: Buffer.concat(chunks).toString('utf8') })
      return endResult
    }) as typeof res.end
  })

  toNodeListener(app)(req, res)
  return result
}

const validRequest = {
  client_id: 'claude-client',
  redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
  response_type: 'code',
  state: 'claude-state',
  code_challenge: 'A'.repeat(43),
  code_challenge_method: 'S256',
  resource: 'https://mcp.example.com/mcp',
  scope: 'mcp:access offline_access',
}

beforeEach(async () => {
  db = new Database(':memory:')
  store = createTokenStore(db)
  recordAuditEvent.mockClear()
  recordAuditEvent.mockResolvedValue(undefined)
  runtimeConfig.bitrix24OauthEnabled = true
  runtimeConfig.bitrix24OauthClientId = 'b24-app-id'
  runtimeConfig.bitrix24OauthRedirectUrl = 'https://mcp.example.com/api/oauth/callback'
  runtimeConfig.bitrix24OauthScope = 'user,task,im,disk'
  runtimeConfig.bitrix24Portal = ''
  vi.stubEnv('BITRIX24_PORTAL', '')
  await store.registerMcpOAuthClient({
    clientId: validRequest.client_id,
    clientName: 'Claude',
    redirectUris: [validRequest.redirect_uri],
  })
  vi.resetModules()
})

afterEach(() => {
  db.close()
  vi.unstubAllEnvs()
})

describe('/api/oauth/authorize', () => {
  it('requires a registered client, exact redirect, resource, and S256 challenge', async () => {
    const res = await callHandler({ ...validRequest, code_challenge_method: 'plain' })
    expect(res.statusCode).toBe(400)

    const redirectMismatch = await callHandler({ ...validRequest, redirect_uri: 'https://attacker.example/callback' })
    expect(redirectMismatch.statusCode).toBe(400)
  })

  it('renders the portal form, then redirects to Bitrix with a persisted CSRF-bound state', async () => {
    const landing = await callHandler(validRequest)
    expect(landing.statusCode).toBe(200)
    expect(landing.body).toContain('Claude')
    expect(landing.body).toContain('name="flow_id"')

    const flowId = landing.body.match(/name="flow_id" value="([a-f0-9]{64})"/)?.[1]
    expect(flowId).toBeDefined()
    const setCookie = landing.headers['set-cookie']
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie
    expect(cookieHeader).toBeDefined()
    const [cookiePair] = String(cookieHeader).split(';')

    const redirected = await callHandler({ flow_id: flowId!, portal: 'dad.bitrix24.ru' }, cookiePair)
    expect(redirected.statusCode).toBe(302)
    const location = new URL(String(redirected.headers.location))
    expect(location.origin).toBe('https://dad.bitrix24.ru')
    expect(location.searchParams.get('client_id')).toBe('b24-app-id')
    expect(location.searchParams.get('redirect_uri')).toBe('https://mcp.example.com/api/oauth/callback')
    const b24State = location.searchParams.get('state')!
    expect(store.consumeState(b24State)).toMatchObject({ portal: 'dad.bitrix24.ru', clientId: 'b24-app-id' })
    expect(store.getMcpOAuthRequest(flowId!)).toMatchObject({ portal: 'dad.bitrix24.ru', b24State })
  })

  it('skips portal selection and redirects to the configured portal', async () => {
    runtimeConfig.bitrix24Portal = 'dad.bitrix24.ru'
    const response = await callHandler(validRequest)

    expect(response.statusCode).toBe(302)
    const location = new URL(String(response.headers.location))
    expect(location.origin).toBe('https://dad.bitrix24.ru')
    expect(location.searchParams.get('scope')).toBe('user,task,im,disk')
    expect(response.headers['set-cookie']).toBeDefined()
    expect(store.consumeState(location.searchParams.get('state')!)).toMatchObject({
      portal: 'dad.bitrix24.ru',
      clientId: 'b24-app-id',
    })
  })

  it('supports BITRIX24_PORTAL as a direct environment-variable alias', async () => {
    vi.stubEnv('BITRIX24_PORTAL', 'dad.bitrix24.ru')
    const response = await callHandler(validRequest)

    expect(response.statusCode).toBe(302)
    expect(new URL(String(response.headers.location)).origin).toBe('https://dad.bitrix24.ru')
  })

  it('fails closed when the configured portal is not an allowed Bitrix24 hostname', async () => {
    runtimeConfig.bitrix24Portal = 'attacker.example.com'
    const response = await callHandler(validRequest)

    expect(response.statusCode).toBe(503)
    expect(response.body).toContain('Configured Bitrix24 portal hostname is invalid')
  })
})