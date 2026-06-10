import { Controller } from '@nestjs/common'
import { EventPattern, Payload } from '@nestjs/microservices'
import {
  DELETE_ATTACHMENT_EMBEDDING,
  DELETE_EMBEDDING,
  DELETE_EMBEDDING_BY_PROJECT,
  DELETE_ROUTINE_EMBEDDING,
  DELETE_TASK_EMBEDDING,
  GENERATE_ATTACHMENT_EMBEDDING,
  GENERATE_COMMENT_EMBEDDING,
  GENERATE_PROJECT_EMBEDDING,
  GENERATE_ROUTINE_EMBEDDING,
  GENERATE_TASK_EMBEDDING,
} from 'src/consts'
import { EmbeddingSourceType } from 'src/generated/prisma/client'
import { EmbeddingService } from './embedding.service'

@Controller()
export class EmbeddingConsumer {
  constructor(private readonly embeddingService: EmbeddingService) {}

  @EventPattern(GENERATE_TASK_EMBEDDING)
  async handleTaskEmbedding(@Payload() data: { taskId: string }) {
    await this.embeddingService.generateForTask(data.taskId)
  }

  @EventPattern(GENERATE_COMMENT_EMBEDDING)
  async handleCommentEmbedding(@Payload() data: { commentId: string }) {
    await this.embeddingService.generateForComment(data.commentId)
  }

  @EventPattern(GENERATE_PROJECT_EMBEDDING)
  async handleProjectEmbedding(@Payload() data: { projectId: string }) {
    await this.embeddingService.generateForProject(data.projectId)
  }

  @EventPattern(DELETE_EMBEDDING)
  async handleDeleteEmbedding(
    @Payload() data: {
      sourceType: 'TASK' | 'COMMENT' | 'PROJECT' | 'ATTACHMENT'
      sourceId: string
    },
  ) {
    await this.embeddingService.deleteBySource(
      data.sourceType as EmbeddingSourceType,
      data.sourceId,
    )
  }

  @EventPattern(DELETE_EMBEDDING_BY_PROJECT)
  async handleDeleteByProject(@Payload() data: { projectId: string }) {
    await this.embeddingService.deleteByProject(data.projectId)
  }

  @EventPattern(DELETE_TASK_EMBEDDING)
  async handleDeleteByTask(@Payload() data: { taskId: string }) {
    await this.embeddingService.deleteByTask(data.taskId)
  }

  @EventPattern(GENERATE_ATTACHMENT_EMBEDDING)
  async handleAttachmentEmbedding(@Payload() data: { attachmentId: string }) {
    await this.embeddingService.generateForAttachment(data.attachmentId)
  }

  @EventPattern(DELETE_ATTACHMENT_EMBEDDING)
  async handleDeleteAttachmentEmbedding(@Payload() data: { attachmentId: string }) {
    await this.embeddingService.deleteBySource(EmbeddingSourceType.ATTACHMENT, data.attachmentId)
  }

  @EventPattern(GENERATE_ROUTINE_EMBEDDING)
  async handleRoutineEmbedding(@Payload() data: { routineId: string }) {
    await this.embeddingService.generateForRoutine(data.routineId)
  }

  @EventPattern(DELETE_ROUTINE_EMBEDDING)
  async handleDeleteRoutineEmbedding(@Payload() data: { routineId: string }) {
    await this.embeddingService.deleteBySource(EmbeddingSourceType.ROUTINE, data.routineId)
  }
}
