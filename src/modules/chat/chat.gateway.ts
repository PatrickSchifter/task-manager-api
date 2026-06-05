import { JwtService } from '@nestjs/jwt'
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import type { Server, Socket } from 'socket.io'
import { CHAT_STATUS_EVENT, WS_TICKET_PURPOSE } from 'src/consts'
import { ChatMessage } from 'src/generated/prisma/client'

function userRoom(userId: string) {
  return `user:${userId}`
}

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  private readonly server: Server

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(socket: Socket) {
    const ticket = socket.handshake.auth?.ticket as string | undefined

    if (!ticket) {
      socket.disconnect()
      return
    }

    try {
      const payload = this.jwtService.verify<{ sub: string; purpose?: string }>(ticket)

      if (payload.purpose !== WS_TICKET_PURPOSE || !payload.sub) {
        socket.disconnect()
        return
      }

      socket.join(userRoom(payload.sub))
    } catch {
      socket.disconnect()
    }
  }

  emitStatus(userId: string, message: ChatMessage) {
    if (!this.server) return
    this.server.to(userRoom(userId)).emit(CHAT_STATUS_EVENT, message)
  }
}
