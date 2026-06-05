import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { CHAT_STATUS_EVENT, WS_TICKET_PURPOSE } from 'src/consts'
import { ChatGateway } from './chat.gateway'

describe('ChatGateway', () => {
  let gateway: ChatGateway
  let jwtService: JwtService

  const makeSocket = (ticket?: string) => ({
    handshake: { auth: ticket ? { ticket } : {} },
    join: jest.fn(),
    disconnect: jest.fn(),
  })

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        {
          provide: JwtService,
          useValue: { verify: jest.fn() },
        },
      ],
    }).compile()

    gateway = module.get<ChatGateway>(ChatGateway)
    jwtService = module.get<JwtService>(JwtService)

    jest.clearAllMocks()
  })

  describe('handleConnection', () => {
    it('joins the user room for a valid ws ticket', () => {
      ;(jwtService.verify as jest.Mock).mockReturnValue({
        sub: 'user1',
        purpose: WS_TICKET_PURPOSE,
      })
      const socket = makeSocket('valid')

      gateway.handleConnection(socket as any)

      expect(socket.join).toHaveBeenCalledWith('user:user1')
      expect(socket.disconnect).not.toHaveBeenCalled()
    })

    it('disconnects when no ticket is provided', () => {
      const socket = makeSocket()

      gateway.handleConnection(socket as any)

      expect(socket.disconnect).toHaveBeenCalled()
      expect(socket.join).not.toHaveBeenCalled()
    })

    it('disconnects when the ticket purpose is wrong', () => {
      ;(jwtService.verify as jest.Mock).mockReturnValue({
        sub: 'user1',
        purpose: 'password-reset',
      })
      const socket = makeSocket('wrong-purpose')

      gateway.handleConnection(socket as any)

      expect(socket.disconnect).toHaveBeenCalled()
      expect(socket.join).not.toHaveBeenCalled()
    })

    it('disconnects when the ticket is invalid', () => {
      ;(jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid')
      })
      const socket = makeSocket('bad')

      gateway.handleConnection(socket as any)

      expect(socket.disconnect).toHaveBeenCalled()
      expect(socket.join).not.toHaveBeenCalled()
    })
  })

  describe('emitStatus', () => {
    it('emits the status event to the user room', () => {
      const emit = jest.fn()
      const to = jest.fn().mockReturnValue({ emit })
      ;(gateway as unknown as { server: { to: jest.Mock } }).server = { to }

      const message = { id: 'msg1', userId: 'user1' } as any
      gateway.emitStatus('user1', message)

      expect(to).toHaveBeenCalledWith('user:user1')
      expect(emit).toHaveBeenCalledWith(CHAT_STATUS_EVENT, message)
    })
  })
})
