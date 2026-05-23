import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { PrismaModule } from 'src/prisma/prisma.module'
import { EmbeddingConsumer } from './embedding.consumer'
import { EmbeddingService } from './embedding.service'
import { EmbeddingClientModule } from './embedding-client.module'
import { RagController } from './rag.controller'
import { RagService } from './rag.service'

@Module({
  imports: [ConfigModule, PrismaModule, EmbeddingClientModule],
  providers: [RagService, EmbeddingService, RequestContextService],
  controllers: [RagController, EmbeddingConsumer],
  exports: [RagService, EmbeddingService],
})
export class RagModule {}
