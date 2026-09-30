export interface McpOAuthRuntimeConfig {
  readonly bitrix24OauthEnabled: boolean
  readonly bitrix24OauthRedirectUrl: string
}

export const MCP_OAUTH_SCOPE = 'mcp:access'

export function getMcpOAuthIssuer(config: McpOAuthRuntimeConfig): string {
  if (!config.bitrix24OauthEnabled) throw new Error('MCP OAuth is disabled')

  let callbackUrl: URL
  try {
    callbackUrl = new URL(config.bitrix24OauthRedirectUrl)
  }
  catch {
    throw new Error('NUXT_BITRIX24_OAUTH_REDIRECT_URL must be an absolute HTTPS URL')
  }

  if (callbackUrl.protocol !== 'https:' || callbackUrl.username || callbackUrl.password) {
    throw new Error('NUXT_BITRIX24_OAUTH_REDIRECT_URL must be an absolute HTTPS URL')
  }

  return callbackUrl.origin
}

export function createProtectedResourceMetadata(issuer: string) {
  return {
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: [MCP_OAUTH_SCOPE],
  }
}

export function createAuthorizationServerMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/api/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    response_types_supported: ['code'],
    authorization_response_iss_parameter_supported: true,
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [MCP_OAUTH_SCOPE, 'offline_access'],
  }
}

export function getMcpOAuthResourceMetadataUrl(config: McpOAuthRuntimeConfig): string {
  return `${getMcpOAuthIssuer(config)}/.well-known/oauth-protected-resource/mcp`
}

export function mcpOAuthChallengeParameters(config: McpOAuthRuntimeConfig): string {
  const metadataUrl = getMcpOAuthResourceMetadataUrl(config)
  return `resource_metadata="${metadataUrl}", scope="${MCP_OAUTH_SCOPE} offline_access"`
}