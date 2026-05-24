import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { PrismaModule } from 'src/prisma/prisma.module'
import { EmbeddingConsumer } from '../embedding/embedding.consumer'
import { EmbeddingModule } from '../embedding/embedding.module'
import { EmbeddingService } from '../embedding/embedding.service'
import { RagController } from './rag.controller'
import { RagService } from './rag.service'

@Module({
  imports: [ConfigModule, PrismaModule, EmbeddingModule],
  providers: [RagService, EmbeddingService, RequestContextService],
  controllers: [RagController, EmbeddingConsumer],
  exports: [RagService, EmbeddingService],
})
export class RagModule {}
