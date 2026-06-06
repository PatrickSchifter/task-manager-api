// rag.service.ts — apenas dispatchers de embedding.
// O loop agêntico (processMessage) foi movido para AgentService.
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ClientProxy } from '@nestjs/microservices'
import {
  DELETE_EMBEDDING,
  DELETE_EMBEDDING_BY_PROJECT,
  DELETE_TASK_EMBEDDING,
  EMBEDDING_SERVICE,
  GENERATE_COMMENT_EMBEDDING,
  GENERATE_PROJECT_EMBEDDING,
  GENERATE_TASK_EMBEDDING,
} from 'src/consts'

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name)

  constructor(@Inject(EMBEDDING_SERVICE) private readonly embeddingClient: ClientProxy) {}

  dispatchTaskEmbedding(taskId: string) {
    this.dispatch(GENERATE_TASK_EMBEDDING, { taskId })
  }

  dispatchCommentEmbedding(commentId: string) {
    this.dispatch(GENERATE_COMMENT_EMBEDDING, { commentId })
  }

  dispatchProjectEmbedding(projectId: string) {
    this.dispatch(GENERATE_PROJECT_EMBEDDING, { projectId })
  }

  dispatchDelete(sourceType: 'TASK' | 'COMMENT' | 'PROJECT', sourceId: string) {
    this.dispatch(DELETE_EMBEDDING, { sourceType, sourceId })
  }

  dispatchProjectDelete(projectId: string) {
    this.dispatch(DELETE_EMBEDDING_BY_PROJECT, { projectId })
  }

  dispatchTaskDelete(taskId: string) {
    this.dispatch(DELETE_TASK_EMBEDDING, { taskId })
  }

  private dispatch(event: string, payload: object) {
    this.embeddingClient.emit(event, payload).subscribe({
      error: (err) => this.logger.error(`Failed to dispatch ${event}`, err),
    })
  }
}
