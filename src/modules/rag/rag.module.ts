import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { CHAT_QUEUE, CHAT_SERVICE, EMBEDDING_QUEUE, EMBEDDING_SERVICE } from 'src/consts'
import { ChatModule } from '../chat/chat.module'
import { EmbeddingModule } from '../embedding/embedding.module'
import { RagConsumer } from './rag.consumer'
import { RagService } from './rag.service'

@Module({
  imports: [
    EmbeddingModule,
    ChatModule,
    ClientsModule.registerAsync([
      {
        name: EMBEDDING_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('rmq.url')],
            queue: EMBEDDING_QUEUE,
            queueOptions: { durable: true },
          },
        }),
      },
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
  providers: [RagService, RequestContextService],
  controllers: [RagConsumer],
  exports: [RagService],
})
export class RagModule {}
