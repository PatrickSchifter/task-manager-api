import { Module } from '@nestjs/common'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { EmbeddingModule } from '../embedding/embedding.module'
import { RagModule } from '../rag/rag.module'
import { RagService } from '../rag/rag.service'
import { CommentsController } from './comments.controller'
import { CommentsService } from './comments.service'

@Module({
  providers: [CommentsService, RequestContextService, RagService],
  controllers: [CommentsController],
  imports: [EmbeddingModule, RagModule],
})
export class CommentsModule {}
