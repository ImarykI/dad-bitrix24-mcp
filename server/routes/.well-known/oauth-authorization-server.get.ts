import { createError, defineEventHandler, setResponseHeader } from 'h3'
import { createAuthorizationServerMetadata, getMcpOAuthIssuer } from '~/server/utils/mcp-oauth-metadata'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  try {
    const issuer = getMcpOAuthIssuer(config)
    setResponseHeader(event, 'cache-control', 'public, max-age=3600')
    return createAuthorizationServerMetadata(issuer)
  }
  catch {
    throw createError({ statusCode: 404, statusMessage: 'OAuth is not enabled' })
  }
})