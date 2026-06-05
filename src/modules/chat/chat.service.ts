import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ClientProxy } from '@nestjs/microservices'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { CHAT_SERVICE, PROCESS_CHAT_MESSAGE, WS_TICKET_PURPOSE } from 'src/consts'
import { Prisma } from 'src/generated/prisma/client'
import { MessageStatus } from 'src/generated/prisma/enums'
import { PrismaService } from 'src/prisma/prisma.service'
import { ChatMessageDTO } from './chat.dto'
import { ChatGateway } from './chat.gateway'

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly chatGateway: ChatGateway,
    private readonly jwtService: JwtService,
    @Inject(CHAT_SERVICE) private readonly chatClient: ClientProxy,
  ) {}

  createWsTicket() {
    const userId = this.requestContext.getUserId()
    const ticket = this.jwtService.sign(
      { sub: userId, purpose: WS_TICKET_PURPOSE },
      { expiresIn: '60s' },
    )
    return { ticket, expiresIn: 60 }
  }

  async enqueue(data: ChatMessageDTO) {
    const userId = this.requestContext.getUserId()

    const chatMessage = await this.prisma.chatMessage.create({
      data: {
        userId,
        content: data.message,
        status: MessageStatus.QUEUED,
      },
    })

    this.chatClient.emit(PROCESS_CHAT_MESSAGE, { messageId: chatMessage.id }).subscribe({
      error: (err) => console.error('Failed to dispatch chat message', err),
    })

    return chatMessage
  }

  async setProcessing(id: string, filters: Prisma.InputJsonValue) {
    const updated = await this.prisma.chatMessage.update({
      where: { id },
      data: {
        status: MessageStatus.PROCESSING,
        filters,
      },
    })
    this.chatGateway.emitStatus(updated.userId, updated)
    return updated
  }

  async setDelivered(id: string, response: string) {
    const updated = await this.prisma.chatMessage.update({
      where: { id },
      data: { status: MessageStatus.DELIVERED, response },
    })
    this.chatGateway.emitStatus(updated.userId, updated)
    return updated
  }

  async setFailed(id: string) {
    const updated = await this.prisma.chatMessage.update({
      where: { id },
      data: { status: MessageStatus.FAILED },
    })
    this.chatGateway.emitStatus(updated.userId, updated)
    return updated
  }

  findById(id: string) {
    const userId = this.requestContext.getUserId()
    return this.prisma.chatMessage.findFirst({ where: { id, userId } })
  }

  findByIdInternal(id: string) {
    return this.prisma.chatMessage.findUnique({ where: { id } })
  }

  findAll(limit: number) {
    const userId = this.requestContext.getUserId()
    return this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }

  findByUserId(userId: string, limit: number) {
    return this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }
}
