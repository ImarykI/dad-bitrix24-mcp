export const CLAUDE_HOSTED_REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback'
export const MCP_OAUTH_CSRF_COOKIE_PREFIX = 'bx24_mcp_oauth_csrf_'

export function mcpOAuthCsrfCookieName(flowId: string): string {
  return `${MCP_OAUTH_CSRF_COOKIE_PREFIX}${flowId}`
}

export interface DcrClientMetadata {
  readonly clientName: string
  readonly redirectUris: readonly string[]
}

export function parseDcrClientMetadata(input: unknown): DcrClientMetadata {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('invalid_client_metadata')
  }

  const metadata = input as Record<string, unknown>
  const redirects = metadata.redirect_uris
  if (!Array.isArray(redirects) || redirects.length !== 1 || redirects[0] !== CLAUDE_HOSTED_REDIRECT_URI) {
    throw new Error('invalid_redirect_uri')
  }

  const tokenAuthMethod = metadata.token_endpoint_auth_method
  if (tokenAuthMethod !== undefined && tokenAuthMethod !== 'none') {
    throw new Error('invalid_client_metadata')
  }

  const responseTypes = metadata.response_types
  if (responseTypes !== undefined && (!Array.isArray(responseTypes) || responseTypes.length !== 1 || responseTypes[0] !== 'code')) {
    throw new Error('invalid_client_metadata')
  }

  const grantTypes = metadata.grant_types
  if (grantTypes !== undefined && (
    !Array.isArray(grantTypes)
    || grantTypes.length === 0
    || grantTypes.some(grant => grant !== 'authorization_code' && grant !== 'refresh_token')
    || !grantTypes.includes('authorization_code')
  )) {
    throw new Error('invalid_client_metadata')
  }

  const clientName = typeof metadata.client_name === 'string' ? metadata.client_name.trim().slice(0, 100) : 'Claude'
  return { clientName: clientName || 'Claude', redirectUris: [CLAUDE_HOSTED_REDIRECT_URI] }
}