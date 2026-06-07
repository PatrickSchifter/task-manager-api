import { Module } from '@nestjs/common'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { AttachmentsModule } from '../attachments/attachments.module'
import { EmbeddingModule } from '../embedding/embedding.module'
import { RagModule } from '../rag/rag.module'
import { CommentsController } from './comments.controller'
import { CommentsService } from './comments.service'

@Module({
  providers: [CommentsService, RequestContextService],
  controllers: [CommentsController],
  imports: [EmbeddingModule, RagModule, AttachmentsModule],
  exports: [CommentsService],
})
export class CommentsModule {}
