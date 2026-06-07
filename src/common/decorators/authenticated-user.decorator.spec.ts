import { ExecutionContext, UnauthorizedException } from '@nestjs/common'

jest.mock('@nestjs/common', () => {
  const actual = jest.requireActual('@nestjs/common')
  return {
    ...actual,
    createParamDecorator: jest
      .fn()
      .mockImplementation((factory: (data: unknown, ctx: ExecutionContext) => any) => {
        return (data?: unknown, ctx?: ExecutionContext) => {
          return factory(data, ctx!)
        }
      }),
  }
})

import { AuthenticatedUser } from './authenticated-user.decorator'

describe('AuthenticatedUser Decorator', () => {
  it('should return the user from the request', () => {
    const mockUser = { id: 'user1', name: 'Test' }
    const mockCtx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: mockUser }),
      }),
    } as ExecutionContext

    const result = AuthenticatedUser(null, mockCtx)
    expect(result).toEqual(mockUser)
  })

  it('should throw UnauthorizedException if user has no id', () => {
    const mockCtx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: {} }),
      }),
    } as ExecutionContext

    expect(() => AuthenticatedUser(null, mockCtx)).toThrow(UnauthorizedException)
  })

  it('should throw UnauthorizedException if user is undefined', () => {
    const mockCtx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: undefined }),
      }),
    } as ExecutionContext

    expect(() => AuthenticatedUser(null, mockCtx)).toThrow(UnauthorizedException)
  })

  it('should throw UnauthorizedException if no request', () => {
    const mockCtx = {
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    } as ExecutionContext

    expect(() => AuthenticatedUser(null, mockCtx)).toThrow(UnauthorizedException)
  })
})
