import { Module } from '@nestjs/common'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { EmbeddingModule } from '../embedding/embedding.module'
import { RagModule } from '../rag/rag.module'
import { RagService } from '../rag/rag.service'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'

@Module({
  providers: [ProjectsService, RequestContextService, RagService],
  controllers: [ProjectsController],
  imports: [EmbeddingModule, RagModule],
})
export class ProjectsModule {}
