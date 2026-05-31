import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { CHAT_QUEUE, CHAT_SERVICE } from 'src/consts'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: CHAT_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('rmq.url')],
            queue: CHAT_QUEUE,
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  providers: [ChatService, RequestContextService],
  controllers: [ChatController],
  exports: [ChatService, ClientsModule],
})
export class ChatModule {}
