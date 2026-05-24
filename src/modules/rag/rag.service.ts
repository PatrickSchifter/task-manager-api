import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ClientProxy } from '@nestjs/microservices'
import OpenAI from 'openai'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import {
  DELETE_EMBEDDING,
  DELETE_EMBEDDING_BY_PROJECT,
  DELETE_TASK_EMBEDDING,
  EMBEDDING_SERVICE,
  GENERATE_COMMENT_EMBEDDING,
  GENERATE_PROJECT_EMBEDDING,
  GENERATE_TASK_EMBEDDING,
} from 'src/consts'
import { EmbeddingService } from '../embedding/embedding.service'

@Injectable()
export class RagService {
  private readonly openai: OpenAI
  private readonly logger = new Logger(RagService.name)

  constructor(
    @Inject(EMBEDDING_SERVICE) private readonly embeddingClient: ClientProxy,
    private readonly embeddingService: EmbeddingService,
    private readonly config: ConfigService,
    private readonly requestContext: RequestContextService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.getOrThrow<string>('openai.apiKey'),
    })
  }

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

  async chat({ message }: { message: string }): Promise<string> {
    const userId = this.requestContext.getUserId()
    const similar = await this.embeddingService.searchSimilar({ userId, query: message })

    if (!similar.length) {
      return "I couldn't find any relevant information for your question."
    }

    const context = similar.map((r, i) => `[${r.sourceType} ${i + 1}]\n${r.content}`).join('\n\n')

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a task management assistant. Answer the user's question based only on the context provided below. Be concise and helpful.\n\nContext:\n${context}`,
        },
        {
          role: 'user',
          content: message,
        },
      ],
    })

    return completion.choices[0].message.content ?? ''
  }

  private dispatch(event: string, payload: object) {
    this.embeddingClient.emit(event, payload).subscribe({
      error: (err) => this.logger.error(`Failed to dispatch ${event}`, err),
    })
  }

  dispatchProjectDelete(projectId: string) {
    this.dispatch(DELETE_EMBEDDING_BY_PROJECT, { projectId })
  }

  dispatchTaskDelete(taskId: string) {
    this.dispatch(DELETE_TASK_EMBEDDING, { taskId })
  }
}
