jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('Hello {{url}}'),
}))

jest.mock('handlebars', () => ({
  compile: jest.fn().mockReturnValue((data: any) => `<html>${data.url}</html>`),
}))

import { ConfigService } from '@nestjs/config'
import { ClientProxy } from '@nestjs/microservices'
import { Test, TestingModule } from '@nestjs/testing'
import { EMAIL_SERVICE, SEND_PASSWORD_RESET } from 'src/consts'
import { MailService } from './mail.service'

jest.mock('resend', () => {
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: {
        send: jest.fn().mockResolvedValue({ data: { id: 'email123' } }),
      },
    })),
  }
})

describe('MailService', () => {
  let service: MailService
  let configService: ConfigService
  let clientProxy: ClientProxy

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockImplementation((key: string) => {
              if (key === 'RESEND_API_KEY') return 'test-resend-key'
              if (key === 'app.web_app_url_base') return 'http://localhost:3000'
              return 'http://localhost:3000'
            }),
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'EMAIL_FROM') return 'noreply@test.com'
              return null
            }),
          },
        },
        {
          provide: EMAIL_SERVICE,
          useValue: {
            emit: jest.fn().mockReturnValue({ subscribe: jest.fn() }),
          },
        },
      ],
    }).compile()

    service = module.get<MailService>(MailService)
    configService = module.get<ConfigService>(ConfigService)
    clientProxy = module.get<ClientProxy>(EMAIL_SERVICE)

    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('sendPasswordRequest', () => {
    it('should send a password reset email message via client.emit', async () => {
      const email = 'test@example.com'
      const token = 'resettoken123'
      const baseUrl = 'http://localhost:3000'
      const expectedUrl = `${baseUrl}/auth/reset-password?token=${token}`

      await service.sendPasswordRequest(email, token)

      expect(configService.getOrThrow).toHaveBeenCalledWith('app.web_app_url_base')
      expect(clientProxy.emit).toHaveBeenCalledWith(SEND_PASSWORD_RESET, {
        email,
        url: expectedUrl,
      })
    })
  })

  describe('sendPasswordRequestDirect', () => {
    it('should render template and send email directly', async () => {
      const email = 'test@example.com'
      const url = 'http://example.com/reset'

      const result = await service.sendPasswordRequestDirect(email, url)

      expect(configService.get).toHaveBeenCalledWith('EMAIL_FROM')
      expect(result).toEqual({ data: { id: 'email123' } })
    })
  })

  describe('sendEmail', () => {
    it('should send an email via resend', async () => {
      await service.sendEmail('user@test.com', 'Subject', '<p>HTML</p>')

      expect(configService.get).toHaveBeenCalledWith('EMAIL_FROM')
    })

    it('should throw error if EMAIL_FROM is not configured', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined)

      await expect(service.sendEmail('user@test.com', 'Subject', '<p>HTML</p>')).rejects.toThrow(
        'EMAIL_FROM não configurado',
      )
    })
  })
})
