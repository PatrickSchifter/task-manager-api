import { Module } from '@nestjs/common'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { EmbeddingClientModule } from '../rag/embedding-client.module'
import { RagModule } from '../rag/rag.module'
import { RagService } from '../rag/rag.service'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'

@Module({
  controllers: [TasksController],
  providers: [TasksService, RequestContextService, RagService],
  imports: [EmbeddingClientModule, RagModule],
})
export class TasksModule {}
