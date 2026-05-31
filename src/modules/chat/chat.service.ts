import { Inject, Injectable } from '@nestjs/common'
import { ClientProxy } from '@nestjs/microservices'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { CHAT_SERVICE, PROCESS_CHAT_MESSAGE } from 'src/consts'
import { Prisma } from 'src/generated/prisma/client'
import { MessageStatus } from 'src/generated/prisma/enums'
import { PrismaService } from 'src/prisma/prisma.service'
import { ChatMessageDTO } from './chat.dto'

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    @Inject(CHAT_SERVICE) private readonly chatClient: ClientProxy,
  ) {}

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
    return this.prisma.chatMessage.update({
      where: { id },
      data: {
        status: MessageStatus.PROCESSING,
        filters,
      },
    })
  }

  async setDelivered(id: string, response: string) {
    return this.prisma.chatMessage.update({
      where: { id },
      data: { status: MessageStatus.DELIVERED, response },
    })
  }

  async setFailed(id: string) {
    return this.prisma.chatMessage.update({
      where: { id },
      data: { status: MessageStatus.FAILED },
    })
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
