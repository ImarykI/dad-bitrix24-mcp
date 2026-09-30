import { describe, expect, it } from 'vitest'
import {
  createAuthorizationServerMetadata,
  createProtectedResourceMetadata,
  getMcpOAuthIssuer,
  MCP_OAUTH_SCOPE,
} from '~/server/utils/mcp-oauth-metadata'

describe('MCP OAuth metadata', () => {
  const config = {
    bitrix24OauthEnabled: true,
    bitrix24OauthRedirectUrl: 'https://mcp.example.com/api/oauth/callback',
  }

  it('derives a canonical issuer from the configured HTTPS Bitrix24 callback', () => {
    expect(getMcpOAuthIssuer(config)).toBe('https://mcp.example.com')
  })

  it('rejects disabled OAuth and non-HTTPS callback URLs', () => {
    expect(() => getMcpOAuthIssuer({ ...config, bitrix24OauthEnabled: false })).toThrow('disabled')
    expect(() => getMcpOAuthIssuer({ ...config, bitrix24OauthRedirectUrl: 'http://mcp.example.com/callback' })).toThrow('HTTPS')
  })

  it('publishes protected-resource metadata for the /mcp resource', () => {
    expect(createProtectedResourceMetadata('https://mcp.example.com')).toEqual({
      resource: 'https://mcp.example.com/mcp',
      authorization_servers: ['https://mcp.example.com'],
      bearer_methods_supported: ['header'],
      scopes_supported: [MCP_OAUTH_SCOPE],
    })
  })

  it('advertises authorization-code PKCE and refresh-token endpoints', () => {
    expect(createAuthorizationServerMetadata('https://mcp.example.com')).toMatchObject({
      issuer: 'https://mcp.example.com',
      authorization_endpoint: 'https://mcp.example.com/api/oauth/authorize',
      token_endpoint: 'https://mcp.example.com/api/oauth/token',
      registration_endpoint: 'https://mcp.example.com/api/oauth/register',
      response_types_supported: ['code'],
      authorization_response_iss_parameter_supported: true,
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: [MCP_OAUTH_SCOPE, 'offline_access'],
    })
  })
})