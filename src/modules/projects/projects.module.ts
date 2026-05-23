import { Module } from '@nestjs/common'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { EmbeddingClientModule } from '../rag/embedding-client.module'
import { RagModule } from '../rag/rag.module'
import { RagService } from '../rag/rag.service'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'

@Module({
  providers: [ProjectsService, RequestContextService, RagService],
  controllers: [ProjectsController],
  imports: [EmbeddingClientModule, RagModule],
})
export class ProjectsModule {}
