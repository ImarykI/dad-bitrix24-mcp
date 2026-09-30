import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as AuditLogModule from '~/server/utils/audit-log'
import type * as TokenStoreModule from '~/server/utils/token-store'
import { createTokenStore, type TokenStore } from '~/server/utils/token-store'

type AuditEvent = Parameters<typeof AuditLogModule.recordAuditEvent>[0]
const { recordAuditEvent } = vi.hoisted(() => ({
  recordAuditEvent: vi.fn<(event: AuditEvent) => Promise<void>>(async () => undefined),
}))
vi.mock('~/server/utils/audit-log', async () => {
  const real = await vi.importActual<typeof AuditLogModule>('~/server/utils/audit-log')
  return { ...real, recordAuditEvent }
})

const runtimeConfig: Record<string, unknown> = {
  bitrix24OauthEnabled: true,
  bitrix24OauthRedirectUrl: 'https://mcp.example.com/api/oauth/callback',
}
vi.stubGlobal('useRuntimeConfig', () => runtimeConfig)

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

async function register(body: unknown): Promise<CapturedResponse> {
  const handler = (await import('~/server/api/oauth/register.post')).default
  const { createApp, eventHandler, toNodeListener } = await import('h3')
  const app = createApp({ onError: (err, event) => {
    const error = err as { statusCode?: number; statusMessage?: string; data?: { error?: string } }
    event.node.res.statusCode = error.statusCode ?? 500
    event.node.res.setHeader('content-type', 'application/json')
    event.node.res.end(JSON.stringify({ error: error.data?.error, error_description: error.statusMessage }))
  } })
  app.use('/api/oauth/register', eventHandler(handler))
  const payload = JSON.stringify(body)
  const req = new IncomingMessage(new Socket())
  req.method = 'POST'
  req.url = '/api/oauth/register'
  req.headers = {
    host: 'mcp.example.com',
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(payload)),
  }
  req.push(payload)
  req.push(null)
  const res = new ServerResponse(req)
  const chunks: Buffer[] = []
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

beforeEach(() => {
  db = new Database(':memory:')
  store = createTokenStore(db)
  recordAuditEvent.mockClear()
  recordAuditEvent.mockResolvedValue(undefined)
  runtimeConfig.bitrix24OauthEnabled = true
  runtimeConfig.bitrix24OauthRedirectUrl = 'https://mcp.example.com/api/oauth/callback'
  vi.resetModules()
})

afterEach(() => db.close())

describe('/api/oauth/register', () => {
  it('registers a public Claude client and persists its exact callback URI', async () => {
    const response = await register({
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    })
    expect(response.statusCode).toBe(201)
    expect(response.headers['cache-control']).toBe('no-store')
    const payload = JSON.parse(response.body) as Record<string, unknown>
    expect(payload).toMatchObject({
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      issuer: 'https://mcp.example.com',
    })
    expect(payload.client_id).toMatch(/^[a-f0-9]{64}$/)
    expect(store.getMcpOAuthClient(String(payload.client_id))?.clientName).toBe('Claude')
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ event: 'mcp.client.register' }))
  })

  it('rejects redirect URIs other than Claude hosted Connectors callback', async () => {
    const response = await register({ redirect_uris: ['https://attacker.example/callback'] })
    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toMatchObject({ error: 'invalid_redirect_uri' })
  })
})