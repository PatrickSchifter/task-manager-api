import { Module } from '@nestjs/common'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { AttachmentsModule } from '../attachments/attachments.module'
import { EmbeddingModule } from '../embedding/embedding.module'
import { RagModule } from '../rag/rag.module'
import { TagsModule } from '../tags/tags.module'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'

@Module({
  controllers: [TasksController],
  providers: [TasksService, RequestContextService],
  imports: [EmbeddingModule, RagModule, TagsModule, AttachmentsModule],
  exports: [TasksService],
})
export class TasksModule {}
