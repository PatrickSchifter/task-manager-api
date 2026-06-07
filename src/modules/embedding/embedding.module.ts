import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { EMBEDDING_QUEUE, EMBEDDING_SERVICE } from 'src/consts'
import { CaptionModule } from '../caption/caption.module'
import { StorageModule } from '../storage/storage.module'
import { EmbeddingConsumer } from './embedding.consumer'
import { EmbeddingService } from './embedding.service'

@Module({
  imports: [
    StorageModule,
    CaptionModule,
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
  controllers: [EmbeddingConsumer],
  providers: [EmbeddingService],
  exports: [ClientsModule, EmbeddingService],
})
export class EmbeddingModule {}
