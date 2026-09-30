import { createHash } from 'node:crypto'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as AuditLogModule from '~/server/utils/audit-log'
import type * as TokenStoreModule from '~/server/utils/token-store'
import { createTokenStore, type TokenStore } from '~/server/utils/token-store'
import { CLAUDE_HOSTED_REDIRECT_URI } from '~/server/utils/mcp-oauth-client'

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

async function callToken(params: Record<string, string>): Promise<CapturedResponse> {
  const handler = (await import('~/server/api/oauth/token.post')).default
  const { createApp, eventHandler, toNodeListener } = await import('h3')
  const app = createApp({ onError: (err, event) => {
    const error = err as { statusCode?: number; statusMessage?: string }
    event.node.res.statusCode = error.statusCode ?? 500
    event.node.res.end(error.statusMessage ?? 'error')
  } })
  app.use('/api/oauth/token', eventHandler(handler))
  const body = new URLSearchParams(params).toString()
  const req = new IncomingMessage(new Socket())
  req.method = 'POST'
  req.url = '/api/oauth/token'
  req.headers = {
    host: 'mcp.example.com',
    'content-type': 'application/x-www-form-urlencoded',
    'content-length': String(Buffer.byteLength(body)),
  }
  req.push(body)
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

const clientId = 'claude-client'
const resource = 'https://mcp.example.com/mcp'
const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const codeChallenge = createHash('sha256').update(verifier).digest('base64url')
const tenant = {
  memberId: 'member-dad',
  userId: 42,
  portalDomain: 'dad.bitrix24.ru',
  accessToken: 'b24-access',
  refreshToken: 'b24-refresh',
  accessExpiresAt: Math.floor(Date.now() / 1000) + 3600,
  scope: 'user,task',
}

beforeEach(async () => {
  db = new Database(':memory:')
  store = createTokenStore(db)
  await store.upsertTokens(tenant, 'install')
  await store.registerMcpOAuthClient({
    clientId,
    clientName: 'Claude',
    redirectUris: [CLAUDE_HOSTED_REDIRECT_URI],
  })
  recordAuditEvent.mockClear()
  recordAuditEvent.mockResolvedValue(undefined)
  runtimeConfig.bitrix24OauthEnabled = true
  runtimeConfig.bitrix24OauthRedirectUrl = 'https://mcp.example.com/api/oauth/callback'
  vi.resetModules()
})

afterEach(() => db.close())

describe('/api/oauth/token', () => {
  it('exchanges a one-time S256 authorization code and returns access + rotating refresh tokens', async () => {
    const code = 'authorization-code-secret'
    await store.createMcpOAuthCode(code, {
      clientId,
      redirectUri: CLAUDE_HOSTED_REDIRECT_URI,
      codeChallenge,
      resource,
      scope: 'mcp:access offline_access',
      memberId: tenant.memberId,
      userId: tenant.userId,
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    })
    const response = await callToken({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: CLAUDE_HOSTED_REDIRECT_URI,
      code_verifier: verifier,
      resource,
    })

    expect(response.statusCode).toBe(200)
    const tokens = JSON.parse(response.body) as Record<string, string | number>
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'mcp:access offline_access' })
    expect(tokens.access_token).toBeTruthy()
    expect(tokens.refresh_token).toBeTruthy()
    const accessHash = `sha256-${createHash('sha256').update(String(tokens.access_token)).digest('hex')}`
    expect(store.inspectMcpOAuthAccessToken(accessHash)).toMatchObject({
      clientId,
      resource,
      memberId: tenant.memberId,
      userId: tenant.userId,
      revokedAt: null,
    })

    const refreshed = await callToken({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: String(tokens.refresh_token),
      resource,
    })
    expect(refreshed.statusCode).toBe(200)
    const rotated = JSON.parse(refreshed.body) as Record<string, string | number>
    expect(rotated.access_token).not.toBe(tokens.access_token)
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token)
    expect(store.inspectMcpOAuthAccessToken(accessHash)?.revokedAt).not.toBeNull()
  })

  it('rejects a wrong PKCE verifier and a token request for another resource', async () => {
    const code = 'another-one-time-code'
    await store.createMcpOAuthCode(code, {
      clientId,
      redirectUri: CLAUDE_HOSTED_REDIRECT_URI,
      codeChallenge,
      resource,
      scope: 'mcp:access',
      memberId: tenant.memberId,
      userId: tenant.userId,
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    })
    const badVerifier = await callToken({
      grant_type: 'authorization_code', client_id: clientId, code,
      redirect_uri: CLAUDE_HOSTED_REDIRECT_URI, code_verifier: 'z'.repeat(43), resource,
    })
    expect(JSON.parse(badVerifier.body)).toMatchObject({ error: 'invalid_grant' })

    const wrongResource = await callToken({
      grant_type: 'refresh_token', client_id: clientId, refresh_token: 'unknown', resource: 'https://attacker.example/mcp',
    })
    expect(JSON.parse(wrongResource.body)).toMatchObject({ error: 'invalid_target' })
  })
})