import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import * as bcrypt from 'bcrypt'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { User } from 'src/generated/prisma/client'
import { PrismaService } from 'src/prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import { UsersService } from '../users/users.service'
import { AuthService } from './auth.service'

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}))

describe('AuthService', () => {
  let service: AuthService
  let usersService: UsersService
  let jwtService: JwtService
  let mailService: MailService
  let prismaService: PrismaService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            create: jest.fn(),
            findByEmail: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendPasswordRequest: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              update: jest.fn(),
            },
          },
        },
        {
          provide: RequestContextService,
          useValue: {
            getUser: jest.fn().mockReturnValue({
              id: 'user1',
              name: 'Test User',
              email: 'test@example.com',
              avatar: null,
              role: 'ADMIN',
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
        },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
    usersService = module.get<UsersService>(UsersService)
    jwtService = module.get<JwtService>(JwtService)
    mailService = module.get<MailService>(MailService)
    prismaService = module.get<PrismaService>(PrismaService)

    // Clear all mocks before each test to ensure a clean state
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('signup', () => {
    it('should successfully sign up a user and return a token', async () => {
      const signUpDto = { name: 'Test User', email: 'test@example.com', password: 'password123' }
      const hashedPassword = 'hashedPassword123'
      const newUser = { id: '1', ...signUpDto, password: hashedPassword }
      const token = 'jwtToken'

      ;(bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword)
      jest.spyOn(usersService, 'create').mockResolvedValue(newUser as unknown as User)
      jest.spyOn(jwtService, 'sign').mockReturnValue(token)

      const result = await service.signup(signUpDto)

      expect(bcrypt.hash).toHaveBeenCalledWith(signUpDto.password, 12)
      expect(usersService.create).toHaveBeenCalledWith({ ...signUpDto, password: hashedPassword })
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: newUser.id })
      expect(result).toEqual({ token })
    })
  })

  describe('signin', () => {
    it('should successfully sign in a user and return a token', async () => {
      const signInDto = { email: 'test@example.com', password: 'password123' }
      const user = {
        id: '1',
        name: 'Test User',
        email: signInDto.email,
        password: 'hashedPassword123',
      }
      const token = 'jwtToken'

      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(user as unknown as User)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)
      jest.spyOn(jwtService, 'sign').mockReturnValue(token)

      const result = await service.signin(signInDto)

      expect(usersService.findByEmail).toHaveBeenCalledWith(signInDto.email)
      expect(bcrypt.compare).toHaveBeenCalledWith(signInDto.password, user.password)
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: user.id })
      expect(result).toEqual({ token })
    })

    it('should throw UnauthorizedException for invalid credentials', async () => {
      const signInDto = { email: 'test@example.com', password: 'wrongpassword' }
      const user = {
        id: '1',
        name: 'Test User',
        email: signInDto.email,
        password: 'hashedPassword123',
      }

      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(user as unknown as User)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(false)

      await expect(service.signin(signInDto)).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException if user not found', async () => {
      const signInDto = { email: 'nonexistent@example.com', password: 'password123' }

      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null)

      await expect(service.signin(signInDto)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('forgotPassword', () => {
    it('should send a password request mail', async () => {
      const email = 'test@example.com'
      const user = { id: '1', email }
      const token = 'resetToken'

      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(user as unknown as User)
      jest.spyOn(jwtService, 'sign').mockReturnValue(token)
      jest.spyOn(mailService, 'sendPasswordRequest').mockResolvedValue(undefined)

      const result = await service.forgotPassword(email)

      expect(usersService.findByEmail).toHaveBeenCalledWith(email)
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
        purpose: 'password-reset',
      })
      expect(mailService.sendPasswordRequest).toHaveBeenCalledWith(user.email, token)
      expect(result).toEqual({ message: 'Password request mail send' })
    })

    it('should throw NotFoundException if user not found', async () => {
      const email = 'nonexistent@example.com'

      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null)

      await expect(service.forgotPassword(email)).rejects.toThrow(NotFoundException)
    })
  })

  describe('resetPassword', () => {
    it('should successfully reset the user password', async () => {
      const token = 'validToken'
      const newPassword = 'newPassword123'
      const payload = { sub: '1', purpose: 'password-reset' }
      const user = { id: '1', email: 'test@example.com', password: 'oldHashedPassword' }
      const newHashedPassword = 'newHashedPassword'

      jest.spyOn(jwtService, 'verify').mockReturnValue(payload)
      jest.spyOn(usersService, 'findById').mockResolvedValue(user as never)
      ;(bcrypt.hash as jest.Mock).mockResolvedValue(newHashedPassword)
      jest
        .spyOn(prismaService.user, 'update')
        .mockResolvedValue({ ...user, password: newHashedPassword } as unknown as User)

      const result = await service.resetPassword(token, newPassword)

      expect(jwtService.verify).toHaveBeenCalledWith(token)
      expect(usersService.findById).toHaveBeenCalledWith(payload.sub)
      expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 12)
      expect(prismaService.user.update).toHaveBeenCalledWith({
        data: { password: newHashedPassword },
        where: { id: user.id },
      })
      expect(result).toEqual({ ...user, password: newHashedPassword })
    })

    it('should throw BadRequestException for invalid token purpose', async () => {
      const token = 'invalidToken'
      const newPassword = 'newPassword123'
      const payload = { sub: '1', purpose: 'some-other-purpose' }

      jest.spyOn(jwtService, 'verify').mockReturnValue(payload)

      await expect(service.resetPassword(token, newPassword)).rejects.toThrow(BadRequestException)
      expect(jwtService.verify).toHaveBeenCalledWith(token)
    })

    it('should throw BadRequestException if user not found during password reset', async () => {
      const token = 'validToken'
      const newPassword = 'newPassword123'
      const payload = { sub: '1', purpose: 'password-reset' }

      jest.spyOn(jwtService, 'verify').mockReturnValue(payload)
      jest.spyOn(usersService, 'findById').mockResolvedValue(null)

      await expect(service.resetPassword(token, newPassword)).rejects.toThrow(BadRequestException)
      expect(jwtService.verify).toHaveBeenCalledWith(token)
      expect(usersService.findById).toHaveBeenCalledWith(payload.sub)
    })

    it('should throw BadRequestException for an expired or invalid token', async () => {
      const token = 'expiredToken'
      const newPassword = 'newPassword123'

      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('Token expired')
      })

      await expect(service.resetPassword(token, newPassword)).rejects.toThrow(BadRequestException)
      expect(jwtService.verify).toHaveBeenCalledWith(token)
    })
  })
})
