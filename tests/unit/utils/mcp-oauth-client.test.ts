import { describe, expect, it } from 'vitest'
import { CLAUDE_HOSTED_REDIRECT_URI, parseDcrClientMetadata } from '~/server/utils/mcp-oauth-client'

describe('Claude OAuth DCR metadata', () => {
  it('accepts Claude public authorization-code clients with the hosted callback', () => {
    expect(parseDcrClientMetadata({
      client_name: 'Claude',
      redirect_uris: [CLAUDE_HOSTED_REDIRECT_URI],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    })).toEqual({ clientName: 'Claude', redirectUris: [CLAUDE_HOSTED_REDIRECT_URI] })
  })

  it('rejects non-Claude redirect URIs and confidential clients', () => {
    expect(() => parseDcrClientMetadata({ redirect_uris: ['https://attacker.example/callback'] }))
      .toThrow('invalid_redirect_uri')
    expect(() => parseDcrClientMetadata({
      redirect_uris: [CLAUDE_HOSTED_REDIRECT_URI],
      token_endpoint_auth_method: 'client_secret_post',
    })).toThrow('invalid_client_metadata')
  })

  it('only accepts authorization-code grants and a bounded client name', () => {
    expect(() => parseDcrClientMetadata({
      redirect_uris: [CLAUDE_HOSTED_REDIRECT_URI],
      grant_types: ['client_credentials'],
    })).toThrow('invalid_client_metadata')
    expect(parseDcrClientMetadata({
      redirect_uris: [CLAUDE_HOSTED_REDIRECT_URI],
      client_name: 'x'.repeat(120),
    }).clientName).toHaveLength(100)
  })
})