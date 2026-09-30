import { createHash } from 'node:crypto'
import { createError, defineEventHandler, readBody, setResponseHeader, setResponseStatus } from 'h3'
import { timingSafeEqualStr } from '~/server/utils/auth-helpers'
import { getMcpOAuthIssuer } from '~/server/utils/mcp-oauth-metadata'
import { useTokenStore } from '~/server/utils/token-store'

const ACCESS_TOKEN_TTL_SEC = 60 * 60
const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 30
const CODE_VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/

function hashVerifier(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

function oauthError(event: Parameters<typeof setResponseStatus>[0], statusCode: number, error: string, description: string) {
  setResponseStatus(event, statusCode)
  return { error, error_description: description }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  setResponseHeader(event, 'pragma', 'no-cache')
  const config = useRuntimeConfig()
  if (!config.bitrix24OauthEnabled) {
    throw createError({ statusCode: 404, statusMessage: 'OAuth is not enabled' })
  }

  let issuer: string
  try {
    issuer = getMcpOAuthIssuer(config)
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'OAuth server is not configured' })
  }

  let body: unknown
  try {
    body = await readBody(event)
  }
  catch {
    return oauthError(event, 400, 'invalid_request', 'Expected an application/x-www-form-urlencoded token request')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return oauthError(event, 400, 'invalid_request', 'Malformed token request')
  }

  const params = body as Record<string, unknown>
  const stringParam = (key: string) => typeof params[key] === 'string' ? params[key] as string : ''
  const clientId = stringParam('client_id')
  const grantType = stringParam('grant_type')
  const resource = stringParam('resource')
  if (!clientId || !resource) {
    return oauthError(event, 400, 'invalid_request', 'client_id and resource are required')
  }

  const store = useTokenStore()
  const client = store.getMcpOAuthClient(clientId)
  if (!client) return oauthError(event, 401, 'invalid_client', 'Unknown OAuth client')
  if (resource !== `${issuer}/mcp`) {
    return oauthError(event, 400, 'invalid_target', 'The resource does not match this MCP server')
  }

  const now = Math.floor(Date.now() / 1000)
  let clientContext
  if (grantType === 'authorization_code') {
    const code = stringParam('code')
    const redirectUri = stringParam('redirect_uri')
    const verifier = stringParam('code_verifier')
    if (!code || !redirectUri || !CODE_VERIFIER_RE.test(verifier)) {
      return oauthError(event, 400, 'invalid_request', 'code, redirect_uri, and a valid code_verifier are required')
    }

    const grant = store.consumeMcpOAuthCode(code)
    if (
      !grant
      || grant.expiresAt < now
      || grant.clientId !== clientId
      || grant.redirectUri !== redirectUri
      || !client.redirectUris.includes(redirectUri)
      || grant.resource !== resource
      || !timingSafeEqualStr(hashVerifier(verifier), grant.codeChallenge)
    ) {
      return oauthError(event, 400, 'invalid_grant', 'Authorization code is invalid, expired, or does not match PKCE')
    }
    clientContext = {
      clientId,
      resource,
      scope: grant.scope,
      memberId: grant.memberId,
      userId: grant.userId,
    }
  }
  else if (grantType === 'refresh_token') {
    const refreshToken = stringParam('refresh_token')
    if (!refreshToken) return oauthError(event, 400, 'invalid_request', 'refresh_token is required')
    const refreshHash = `sha256-${createHash('sha256').update(refreshToken).digest('hex')}`
    const refresh = await store.consumeMcpOAuthRefreshToken(refreshHash, 'refresh')
    if (
      !refresh
      || refresh.expiresAt < now
      || refresh.clientId !== clientId
      || refresh.resource !== resource
    ) {
      return oauthError(event, 400, 'invalid_grant', 'Refresh token is invalid, expired, or already used')
    }
    await store.revokeMcpOAuthAccessToken(refresh.accessTokenHash, 'refresh')
    clientContext = {
      clientId,
      resource,
      scope: refresh.scope,
      memberId: refresh.memberId,
      userId: refresh.userId,
    }
  }
  else {
    return oauthError(event, 400, 'unsupported_grant_type', 'Only authorization_code and refresh_token are supported')
  }

  const accessExpiresAt = now + ACCESS_TOKEN_TTL_SEC
  const access = await store.createMcpOAuthAccessToken({ ...clientContext, expiresAt: accessExpiresAt }, grantType === 'refresh_token' ? 'refresh' : 'install')
  const tokenResponse: Record<string, string | number> = {
    access_token: access.bearer,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SEC,
    scope: clientContext.scope,
  }

  if (clientContext.scope.split(/\s+/).includes('offline_access')) {
    const refresh = await store.createMcpOAuthRefreshToken({
      ...clientContext,
      expiresAt: now + REFRESH_TOKEN_TTL_SEC,
    }, access.bearerHash, grantType === 'refresh_token' ? 'refresh' : 'install')
    tokenResponse.refresh_token = refresh.bearer
  }

  return tokenResponse
})