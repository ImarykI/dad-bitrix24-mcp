import { randomBytes } from 'node:crypto'
import { createError, defineEventHandler, getCookie, getQuery, getRequestURL, sendRedirect, setCookie, setResponseStatus } from 'h3'
import { timingSafeEqualStr } from '~/server/utils/auth-helpers'
import { htmlEscape, renderHostnameDisclosure, setHtmlResponseHeaders } from '~/server/utils/oauth-html'
import { isAllowedPortalDomain } from '~/server/utils/portal-validation'
import { useTokenStore } from '~/server/utils/token-store'
import { getMcpOAuthIssuer, MCP_OAUTH_SCOPE } from '~/server/utils/mcp-oauth-metadata'
import { mcpOAuthCsrfCookieName } from '~/server/utils/mcp-oauth-client'

const FLOW_TTL_SEC = 5 * 60
const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/

function newNonce(): string {
  return randomBytes(32).toString('hex')
}

function authorizationForm(flowId: string, clientName: string, host: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Connect Bitrix24 to Claude</title></head><body>
<h1>Connect your Bitrix24 portal</h1>
${renderHostnameDisclosure(host)}
<p>Claude will access your Bitrix24 account through this MCP server as you.</p>
<p>Client: <strong>${htmlEscape(clientName)}</strong></p>
<form action="/api/oauth/authorize" method="get" autocomplete="off">
<input type="hidden" name="flow_id" value="${htmlEscape(flowId)}">
<label for="portal">Bitrix24 portal hostname</label>
<input type="text" id="portal" name="portal" placeholder="acme.bitrix24.com" required autofocus>
<button type="submit">Continue to Bitrix24</button>
</form>
</body></html>`
}

export default defineEventHandler(async (event) => {
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

  const store = useTokenStore()
  const configuredPortal = String(config.bitrix24Portal || process.env.BITRIX24_PORTAL || '').trim().toLowerCase()
  if (configuredPortal && !isAllowedPortalDomain(configuredPortal)) {
    throw createError({ statusCode: 503, statusMessage: 'Configured Bitrix24 portal hostname is invalid' })
  }

  const launchBitrixAuthorization = (flowId: string, csrfCookie: string, portal: string, requestExpiresAt: number) => {
    const now = Math.floor(Date.now() / 1000)
    const b24State = newNonce()
    if (!store.bindMcpOAuthRequest(flowId, csrfCookie, portal, b24State)) {
      throw createError({ statusCode: 400, statusMessage: 'OAuth request was already used', data: { error: 'invalid_request' } })
    }

    const clientId = String(config.bitrix24OauthClientId ?? '').trim()
    const redirectUrl = String(config.bitrix24OauthRedirectUrl ?? '').trim()
    store.createState({
      state: b24State,
      portal,
      clientId,
      csrfCookie,
      expiresAt: Math.min(requestExpiresAt, now + FLOW_TTL_SEC),
    })

    setCookie(event, mcpOAuthCsrfCookieName(flowId), csrfCookie, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/oauth/',
      maxAge: FLOW_TTL_SEC,
    })

    const authorizeUrl = new URL(`https://${portal}/oauth/authorize/`)
    authorizeUrl.searchParams.set('client_id', clientId)
    authorizeUrl.searchParams.set('state', b24State)
    authorizeUrl.searchParams.set('redirect_uri', redirectUrl)
    authorizeUrl.searchParams.set('scope', String(config.bitrix24OauthScope ?? 'user,task,im,disk'))
    authorizeUrl.searchParams.set('response_type', 'code')
    return sendRedirect(event, authorizeUrl.toString(), 302)
  }

  const query = getQuery(event)
  const submittedFlowId = typeof query.flow_id === 'string' ? query.flow_id : ''

  if (submittedFlowId) {
    const pending = store.getMcpOAuthRequest(submittedFlowId)
    const now = Math.floor(Date.now() / 1000)
    if (!pending || pending.b24State || pending.expiresAt < now) {
      throw createError({ statusCode: 400, statusMessage: 'OAuth request is missing or expired', data: { error: 'invalid_request' } })
    }

    const cookieName = mcpOAuthCsrfCookieName(submittedFlowId)
    const cookie = getCookie(event, cookieName) ?? ''
    if (!timingSafeEqualStr(cookie, pending.csrfCookie)) {
      throw createError({ statusCode: 400, statusMessage: 'OAuth request CSRF check failed', data: { error: 'invalid_request' } })
    }

    const portal = typeof query.portal === 'string' ? query.portal.trim().toLowerCase() : ''
    if (!isAllowedPortalDomain(portal)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Bitrix24 portal hostname', data: { error: 'invalid_request' } })
    }

    return launchBitrixAuthorization(submittedFlowId, pending.csrfCookie, portal, pending.expiresAt)
  }

  const clientId = typeof query.client_id === 'string' ? query.client_id : ''
  const redirectUri = typeof query.redirect_uri === 'string' ? query.redirect_uri : ''
  const clientState = typeof query.state === 'string' ? query.state : ''
  const responseType = typeof query.response_type === 'string' ? query.response_type : ''
  const codeChallenge = typeof query.code_challenge === 'string' ? query.code_challenge : ''
  const challengeMethod = typeof query.code_challenge_method === 'string' ? query.code_challenge_method : ''
  const resource = typeof query.resource === 'string' ? query.resource : ''
  const requestedScope = typeof query.scope === 'string' ? query.scope : MCP_OAUTH_SCOPE
  const scopes = requestedScope.split(/\s+/).filter(Boolean)
  const client = store.getMcpOAuthClient(clientId)

  if (
    !client
    || !redirectUri
    || !client.redirectUris.includes(redirectUri)
    || responseType !== 'code'
    || clientState.length < 1
    || clientState.length > 1024
    || challengeMethod !== 'S256'
    || !CODE_CHALLENGE_RE.test(codeChallenge)
    || resource !== `${issuer}/mcp`
    || !scopes.includes(MCP_OAUTH_SCOPE)
    || scopes.some(scope => scope !== MCP_OAUTH_SCOPE && scope !== 'offline_access')
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid OAuth authorization request', data: { error: 'invalid_request' } })
  }

  const flowId = newNonce()
  const csrfCookie = newNonce()
  const expiresAt = Math.floor(Date.now() / 1000) + FLOW_TTL_SEC
  store.createMcpOAuthRequest({
    flowId,
    clientId,
    redirectUri,
    clientState,
    codeChallenge,
    resource,
    scope: scopes.join(' '),
    csrfCookie,
    expiresAt,
  })
  if (configuredPortal) {
    return launchBitrixAuthorization(flowId, csrfCookie, configuredPortal, expiresAt)
  }

  setCookie(event, mcpOAuthCsrfCookieName(flowId), csrfCookie, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/oauth/',
    maxAge: FLOW_TTL_SEC,
  })

  setHtmlResponseHeaders(event)
  setResponseStatus(event, 200)
  const host = getRequestURL(event).host
  return authorizationForm(flowId, client.clientName, host)
})