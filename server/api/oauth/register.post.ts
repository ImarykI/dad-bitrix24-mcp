import { randomBytes } from 'node:crypto'
import { createError, defineEventHandler, readBody, setResponseHeader, setResponseStatus } from 'h3'
import { useTokenStore } from '~/server/utils/token-store'
import { getMcpOAuthIssuer } from '~/server/utils/mcp-oauth-metadata'
import { parseDcrClientMetadata } from '~/server/utils/mcp-oauth-client'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (!config.bitrix24OauthEnabled) {
    throw createError({ statusCode: 404, statusMessage: 'OAuth is not enabled' })
  }

  let metadata
  try {
    metadata = parseDcrClientMetadata(await readBody(event))
  }
  catch (err) {
    const error = (err as Error).message
    throw createError({
      statusCode: 400,
      statusMessage: error === 'invalid_redirect_uri' ? 'Invalid redirect URI' : 'Invalid client metadata',
      data: { error },
    })
  }

  let issuer: string
  try {
    issuer = getMcpOAuthIssuer(config)
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'OAuth server is not configured' })
  }

  const clientId = randomBytes(32).toString('hex')
  await useTokenStore().registerMcpOAuthClient({
    clientId,
    clientName: metadata.clientName,
    redirectUris: metadata.redirectUris,
  })

  setResponseHeader(event, 'cache-control', 'no-store')
  setResponseHeader(event, 'pragma', 'no-cache')
  setResponseStatus(event, 201)
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: metadata.clientName,
    redirect_uris: metadata.redirectUris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    issuer,
  }
})