import { UnauthorizedException } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { JwtStrategy } from './jwt.strategy'

describe('JwtStrategy', () => {
  let strategy: JwtStrategy
  let prisma: PrismaService

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    } as any

    process.env.JWT_SECRET = 'test-secret'

    strategy = new JwtStrategy(prisma)
  })

  it('should be defined', () => {
    expect(strategy).toBeDefined()
  })

  it('should throw UnauthorizedException for password-reset token', async () => {
    await expect(strategy.validate({ sub: 'user1', purpose: 'password-reset' })).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('should return null if user not found', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null)

    const result = await strategy.validate({ sub: 'nonexistent', purpose: 'auth' })

    expect(result).toBeNull()
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'nonexistent' } })
  })

  it('should return the user for valid auth tokens', async () => {
    const mockUser = { id: 'user1', name: 'Test', email: 'test@test.com' }
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser as any)

    const result = await strategy.validate({ sub: 'user1', purpose: 'auth' })

    expect(result).toEqual(mockUser)
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user1' } })
  })
})
