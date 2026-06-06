import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { EMBEDDING_QUEUE, EMBEDDING_SERVICE } from 'src/consts'
import { RagService } from './rag.service'

@Module({
  imports: [
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
    ]),
  ],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
