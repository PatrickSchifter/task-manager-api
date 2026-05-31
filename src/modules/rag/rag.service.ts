// rag.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ClientProxy } from '@nestjs/microservices'
import OpenAI from 'openai'
import {
  DELETE_EMBEDDING,
  DELETE_EMBEDDING_BY_PROJECT,
  DELETE_TASK_EMBEDDING,
  EMBEDDING_SERVICE,
  GENERATE_COMMENT_EMBEDDING,
  GENERATE_PROJECT_EMBEDDING,
  GENERATE_TASK_EMBEDDING,
} from 'src/consts'
import { Prisma } from 'src/generated/prisma/client'
import { ChatService } from '../chat/chat.service'
import { EmbeddingService } from '../embedding/embedding.service'

interface StructuredFilters {
  status?: string[]
  priority?: string[]
  projectId?: string
  sourceTypes?: ('TASK' | 'COMMENT' | 'PROJECT')[]
}

@Injectable()
export class RagService {
  private readonly openai: OpenAI
  private readonly logger = new Logger(RagService.name)

  constructor(
    @Inject(EMBEDDING_SERVICE) private readonly embeddingClient: ClientProxy,
    private readonly embeddingService: EmbeddingService,
    private readonly chatService: ChatService,
    private readonly config: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.getOrThrow<string>('openai.apiKey'),
    })
  }

  // ─── Chamado pelo RagConsumer via fila ────────────────────────────────────

  async processMessage({ messageId }: { messageId: string }): Promise<void> {
    const chatMessage = await this.chatService.findByIdInternal(messageId)

    if (!chatMessage) {
      this.logger.error(`ChatMessage ${messageId} not found`)
      return
    }

    try {
      // Etapa 1 — extrai filtros estruturados e marca como processando
      const filters = await this.extractFilters(chatMessage.content)

      await this.chatService.setProcessing(messageId, filters as Prisma.InputJsonValue)

      // Etapa 2a — busca relacional: quais embeddings passam nos filtros
      const allowedSourceIds = await this.embeddingService.filterToEmbeddingIds(
        chatMessage.userId,
        filters,
      )

      // Se os filtros retornaram IDs mas nenhum foi encontrado, entrega fallback
      const hasActiveFilters = Object.keys(filters).length > 0
      if (hasActiveFilters && !allowedSourceIds.length) {
        await this.chatService.setDelivered(
          messageId,
          "I couldn't find any relevant information for your question.",
        )
        return
      }

      // Etapa 2b — busca vetorial restrita aos IDs (ou sem restrição se sem filtros)
      const similar = await this.embeddingService.searchSimilar({
        userId: chatMessage.userId,
        query: chatMessage.content,
        allowedSourceIds: hasActiveFilters ? allowedSourceIds : undefined,
      })

      if (!similar.length) {
        await this.chatService.setDelivered(
          messageId,
          "I couldn't find any relevant information for your question.",
        )
        return
      }

      const context = similar.map((r, i) => `[${r.sourceType} ${i + 1}]\n${r.content}`).join('\n\n')

      // Etapa 3 — gera resposta final
      const response = await this.generateResponse(chatMessage.content, context)
      await this.chatService.setDelivered(messageId, response)
    } catch (err) {
      this.logger.error(`Failed to process message ${messageId}`, err)
      await this.chatService.setFailed(messageId)
    }
  }

  // ─── 1ª chamada: extrai filtros em JSON ──────────────────────────────────

  private async extractFilters(message: string): Promise<StructuredFilters> {
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a query parser for a task management system.
Analyze the user's question and return ONLY a JSON object with filters to narrow the search.

Available fields (omit if not relevant):
- status: array of task statuses (e.g. ["TODO", "IN_PROGRESS", "DONE"])
- priority: array of priorities (e.g. ["HIGH", "LOW", "MEDIUM"])
- projectId: a specific project UUID if mentioned
- sourceTypes: array of source types to search (["TASK", "COMMENT", "PROJECT"])

Return {} if no filters apply. Never include extra text outside the JSON.`,
        },
        { role: 'user', content: message },
      ],
    })

    try {
      return JSON.parse(completion.choices[0].message.content ?? '{}') as StructuredFilters
    } catch {
      this.logger.warn('Failed to parse filters from 1st call, falling back to {}')
      return {}
    }
  }

  // ─── 2ª chamada: gera resposta final ─────────────────────────────────────

  private async generateResponse(message: string, context: string): Promise<string> {
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a task management assistant. Answer the user's question based only on the context provided below. Be concise and helpful.\n\nContext:\n${context}`,
        },
        { role: 'user', content: message },
      ],
    })

    return completion.choices[0].message.content ?? ''
  }

  // ─── Dispatchers de embedding (sem alteração) ─────────────────────────────

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
