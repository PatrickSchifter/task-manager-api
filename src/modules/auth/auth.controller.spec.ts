import { Test, TestingModule } from '@nestjs/testing'
import { AuthController } from './auth.controller'
import { ForgotPasswordDTO, ResetPasswordDTO, SignInDTO, SignUpDTO } from './auth.dto'
import { AuthService } from './auth.service'

describe('AuthController', () => {
  let controller: AuthController
  let authService: AuthService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            signup: jest.fn(),
            signin: jest.fn(),
            forgotPassword: jest.fn(),
            resetPassword: jest.fn(),
          },
        },
      ],
    }).compile()

    controller = module.get<AuthController>(AuthController)
    authService = module.get<AuthService>(AuthService)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('signup', () => {
    it('should call authService.signup and return the result', async () => {
      const signUpDto: SignUpDTO = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      }
      const serviceResult = { token: 'jwtToken' }
      jest.spyOn(authService, 'signup').mockResolvedValue(serviceResult)

      const result = await controller.signup(signUpDto)

      expect(authService.signup).toHaveBeenCalledWith(signUpDto)
      expect(result).toEqual(serviceResult)
    })
  })

  describe('signin', () => {
    it('should call authService.signin and return the result', async () => {
      const signInDto: SignInDTO = { email: 'test@example.com', password: 'password123' }
      const serviceResult = { token: 'jwtToken' }
      jest.spyOn(authService, 'signin').mockResolvedValue(serviceResult)

      const result = await controller.signin(signInDto)

      expect(authService.signin).toHaveBeenCalledWith(signInDto)
      expect(result).toEqual(serviceResult)
    })
  })

  describe('forgotPassword', () => {
    it('should call authService.forgotPassword and return the result', async () => {
      const forgotPasswordDto: ForgotPasswordDTO = { email: 'test@example.com' }
      const serviceResult = { message: 'Password request mail send' }
      jest.spyOn(authService, 'forgotPassword').mockResolvedValue(serviceResult)

      const result = await controller.forgotPassword(forgotPasswordDto)

      expect(authService.forgotPassword).toHaveBeenCalledWith(forgotPasswordDto.email)
      expect(result).toEqual(serviceResult)
    })
  })

  describe('resetPassword', () => {
    it('should call authService.resetPassword and return the result', async () => {
      const resetPasswordDto: ResetPasswordDTO = {
        token: 'validToken',
        newPassword: 'newPassword123',
      }
      const serviceResult = { message: 'Password has been reset' }
      jest.spyOn(authService, 'resetPassword').mockResolvedValue(serviceResult as never)

      const result = await controller.resetPassword(resetPasswordDto)

      expect(authService.resetPassword).toHaveBeenCalledWith(
        resetPasswordDto.token,
        resetPasswordDto.newPassword,
      )
      expect(result).toEqual(serviceResult)
    })
  })
})
