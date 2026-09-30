import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitrix24ErrorCode } from '../../../../server/utils/errors'
import { fakeOk, makeFakeBitrix24 } from '../../_helpers/bitrix24-mock'

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({
  defineMcpTool: <T,>(spec: T) => spec,
}))

const { useBitrix24Tenant } = vi.hoisted(() => ({ useBitrix24Tenant: vi.fn() }))
vi.mock('~/server/utils/bitrix24-tenant', () => ({ useBitrix24Tenant }))

interface ToolContent {
  content: { type: 'text'; text: string }[]
}

const tool = (await import('../../../../server/mcp/tools/users/get-user')).default as unknown as {
  inputSchema: { userId: { safeParse: (value: unknown) => { success: boolean } } }
  handler: (input: { userId: number }) => Promise<ToolContent>
}

describe('b24_user_get', () => {
  const firstUserClient = makeFakeBitrix24()
  const secondUserClient = makeFakeBitrix24()

  beforeEach(() => {
    firstUserClient.v2Call.mockReset()
    secondUserClient.v2Call.mockReset()
    useBitrix24Tenant.mockReset()
  })

  it('validates a positive numeric user ID', () => {
    expect(tool.inputSchema.userId.safeParse(3).success).toBe(true)
    expect(tool.inputSchema.userId.safeParse(0).success).toBe(false)
    expect(tool.inputSchema.userId.safeParse('3').success).toBe(false)
  })

  it('calls user.get through the current request client and returns a minimal profile', async () => {
    firstUserClient.v2Call.mockResolvedValue(fakeOk([{
      ID: '42', NAME: 'Ada', LAST_NAME: 'Lovelace', SECOND_NAME: '',
      WORK_POSITION: 'Engineer', UF_DEPARTMENT: [7], EMAIL: 'not-requested@example.test',
    }]))
    useBitrix24Tenant.mockReturnValue(firstUserClient.b24)

    const result = await tool.handler({ userId: 42 })

    expect(useBitrix24Tenant).toHaveBeenCalledTimes(1)
    expect(firstUserClient.v2Call).toHaveBeenCalledWith({
      method: 'user.get',
      params: {
        filter: { ID: 42 },
        select: ['ID', 'NAME', 'LAST_NAME', 'SECOND_NAME', 'WORK_POSITION', 'UF_DEPARTMENT'],
        start: 0,
      },
    })
    const payload = JSON.parse(result.content[0]!.text)
    expect(payload).toEqual({
      id: 42,
      firstName: 'Ada',
      lastName: 'Lovelace',
      secondName: null,
      position: 'Engineer',
      departmentIds: [7],
    })
    expect(result.content[0]!.text).not.toContain('not-requested@example.test')
  })

  it('resolves the current tenant client per invocation instead of retaining a shared client', async () => {
    firstUserClient.v2Call.mockResolvedValue(fakeOk([{ ID: 1, NAME: 'User A' }]))
    secondUserClient.v2Call.mockResolvedValue(fakeOk([{ ID: 2, NAME: 'User B' }]))
    useBitrix24Tenant.mockReturnValueOnce(firstUserClient.b24).mockReturnValueOnce(secondUserClient.b24)

    const resultA = await tool.handler({ userId: 1 })
    const resultB = await tool.handler({ userId: 2 })

    expect(JSON.parse(resultA.content[0]!.text).firstName).toBe('User A')
    expect(JSON.parse(resultB.content[0]!.text).firstName).toBe('User B')
    expect(firstUserClient.v2Call).toHaveBeenCalledTimes(1)
    expect(secondUserClient.v2Call).toHaveBeenCalledTimes(1)
  })

  it('returns an actionable missing-user error', async () => {
    firstUserClient.v2Call.mockResolvedValue(fakeOk([]))
    useBitrix24Tenant.mockReturnValue(firstUserClient.b24)

    await expect(tool.handler({ userId: 404 })).rejects.toMatchObject({
      name: 'Bitrix24ToolError',
      code: Bitrix24ErrorCode.INVALID_INPUT,
      message: 'Bitrix24 user 404 was not found.',
    })
  })

  it('preserves Bitrix24 error codes from the shared call wrapper', async () => {
    firstUserClient.v2Call.mockRejectedValue(Object.assign(new Error('ACCESS_DENIED'), { code: 'ACCESS_DENIED' }))
    useBitrix24Tenant.mockReturnValue(firstUserClient.b24)

    await expect(tool.handler({ userId: 42 })).rejects.toMatchObject({
      name: 'Bitrix24ToolError',
      code: 'ACCESS_DENIED',
    })
  })
})