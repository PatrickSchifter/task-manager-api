import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import mammoth from 'mammoth'
import OpenAI from 'openai'
import { PDFParse } from 'pdf-parse'
import { projectAccessWhere } from 'src/common/authorization/project-access'
import {
  AttachmentStatus,
  EmbeddingSourceType,
  Prisma,
  TaskPriority,
} from 'src/generated/prisma/client'
import { PrismaService } from 'src/prisma/prisma.service'
import {
  CHUNK_OVERLAP_CHARS,
  CHUNK_TARGET_CHARS,
  IMAGE_MIME_TYPES,
} from '../attachments/attachment.constants'
import { CAPTION_PROVIDER, type CaptionProvider } from '../caption/caption.provider'
import { StorageService } from '../storage/storage.service'

@Injectable()
export class EmbeddingService {
  private readonly openai: OpenAI
  private readonly logger = new Logger(EmbeddingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storageService: StorageService,
    @Inject(CAPTION_PROVIDER) private readonly captionProvider: CaptionProvider,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.getOrThrow<string>('openai.apiKey'),
    })
  }

  async generateForTask(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: { select: { name: true } },
        assignee: { select: { name: true } },
        tags: { select: { tag: { select: { name: true } } } },
        parent: { select: { id: true, title: true } },
        subtasks: { select: { title: true, status: true } },
      },
    })

    if (!task) throw new NotFoundException(`Task ${taskId} not found`)

    const tagNames = task.tags.map((t) => t.tag.name)
    const doneSubtasks = task.subtasks.filter((s) => s.status === 'DONE').length
    const subtasksLine = task.subtasks.length
      ? `Subtasks (${doneSubtasks}/${task.subtasks.length} done): ` +
        task.subtasks.map((s) => `[${s.status}] ${s.title}`).join('; ')
      : null

    const content = [
      `Title: ${task.title}`,
      task.description ? `Description: ${task.description}` : null,
      `Status: ${task.status}`,
      `Priority: ${task.priority}`,
      `Project: ${task.project.name}`,
      task.assignee ? `Assignee: ${task.assignee.name}` : null,
      task.dueDate ? `Due date: ${task.dueDate.toISOString().split('T')[0]}` : null,
      tagNames.length ? `Tags: ${tagNames.join(', ')}` : null,
      task.parent ? `Parent task: ${task.parent.title}` : null,
      subtasksLine,
    ]
      .filter(Boolean)
      .join('\n')

    const metadata = {
      projectId: task.projectId,
      assigneeId: task.assigneeId,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate?.toISOString() ?? null,
      parentId: task.parentId,
      parentTitle: task.parent?.title ?? null,
    }

    await this.upsert({ sourceType: EmbeddingSourceType.TASK, sourceId: taskId, content, metadata })
  }

  async generateForComment(commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        task: { select: { id: true, title: true, projectId: true } },
        author: { select: { name: true } },
      },
    })

    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`)

    const content = [
      `Comment on task: ${comment.task.title}`,
      `Author: ${comment.author.name}`,
      `Content: ${comment.content}`,
    ].join('\n')

    const metadata = {
      taskId: comment.taskId,
      projectId: comment.task.projectId,
      authorId: comment.authorId,
    }

    await this.upsert({
      sourceType: EmbeddingSourceType.COMMENT,
      sourceId: commentId,
      content,
      metadata,
    })
  }

  async generateForProject(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { createdBy: { select: { name: true } } },
    })

    if (!project) throw new NotFoundException(`Project ${projectId} not found`)

    if (!project.description) {
      this.logger.warn(`Project ${projectId} has no description, skipping embedding`)
      return
    }

    const content = [
      `Project: ${project.name}`,
      `Description: ${project.description}`,
      `Created by: ${project.createdBy.name}`,
    ].join('\n')

    await this.upsert({
      sourceType: EmbeddingSourceType.PROJECT,
      sourceId: projectId,
      content,
      metadata: { createdById: project.createdById },
    })
  }

  async generateForAttachment(attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        task: { select: { id: true, title: true, projectId: true } },
        comment: { select: { id: true } },
      },
    })

    if (!attachment) throw new NotFoundException(`Attachment ${attachmentId} not found`)

    await this.prisma.attachment.update({
      where: { id: attachmentId },
      data: { status: AttachmentStatus.PROCESSING },
    })

    try {
      const isImage = (IMAGE_MIME_TYPES as readonly string[]).includes(attachment.mimeType)
      let chunks: string[]

      if (isImage) {
        const caption = await this.captionProvider.describe({
          imageUrl: attachment.url ?? undefined,
          mimeType: attachment.mimeType,
        })
        chunks = caption.trim() ? [caption] : []
      } else {
        const buffer = await this.storageService.download(attachment.storageKey)
        chunks = await this.extractAndChunk(buffer, attachment.mimeType, attachmentId)
      }

      if (!chunks.length) {
        this.logger.warn(`No content extracted from attachment ${attachmentId}`)
        await this.prisma.attachment.update({
          where: { id: attachmentId },
          data: { status: AttachmentStatus.FAILED },
        })
        return
      }

      const baseMetadata = {
        taskId: attachment.taskId,
        projectId: attachment.task.projectId,
        commentId: attachment.commentId,
        fileName: attachment.fileName,
        kind: isImage ? 'image' : 'document',
      }

      // Generate every embedding first (network I/O stays OUT of the transaction)…
      const embeddedChunks = await Promise.all(
        chunks.map(async (content, i) => ({
          content,
          chunkIndex: i,
          vector: await this.embed(content),
          metadata: JSON.stringify({ ...baseMetadata, chunkIndex: i }),
        })),
      )

      // …then swap all chunks atomically: delete old + insert new in one transaction,
      // so a concurrent job can never observe a half-rewritten chunk set.
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`
          DELETE FROM "Embedding"
          WHERE "sourceType" = ${EmbeddingSourceType.ATTACHMENT}::"EmbeddingSourceType"
            AND "sourceId" = ${attachmentId}
        `)

        for (const { content, chunkIndex, vector, metadata } of embeddedChunks) {
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "Embedding" ("id", "sourceType", "sourceId", "content", "vector", "metadata", "chunkIndex", "createdAt")
            VALUES (
              gen_random_uuid(),
              ${EmbeddingSourceType.ATTACHMENT}::"EmbeddingSourceType",
              ${attachmentId},
              ${content},
              ${vector}::vector,
              ${metadata}::jsonb,
              ${chunkIndex},
              now()
            )
            ON CONFLICT ("sourceType", "sourceId", "chunkIndex") DO UPDATE
              SET "content"  = EXCLUDED."content",
                  "vector"   = EXCLUDED."vector",
                  "metadata" = EXCLUDED."metadata"
          `)
        }
      })

      await this.prisma.attachment.update({
        where: { id: attachmentId },
        data: { status: AttachmentStatus.EMBEDDED },
      })
    } catch (err) {
      this.logger.error(`Failed to generate embedding for attachment ${attachmentId}`, err)
      await this.prisma.attachment.update({
        where: { id: attachmentId },
        data: { status: AttachmentStatus.FAILED },
      })
      throw err
    }
  }

  async deleteBySource(sourceType: EmbeddingSourceType, sourceId: string) {
    await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "Embedding"
      WHERE "sourceType" = ${sourceType}::"EmbeddingSourceType"
        AND "sourceId" = ${sourceId}
    `)
  }

  async searchSimilar({
    userId,
    query,
    limit = 5,
    allowedSourceIds,
  }: {
    userId: string
    query: string
    limit?: number
    allowedSourceIds?: { sourceType: EmbeddingSourceType; sourceId: string }[]
  }) {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    })

    const vector = `[${response.data[0].embedding.join(',')}]`

    type Result = { sourceType: string; sourceId: string; content: string; similarity: number }

    if (allowedSourceIds && allowedSourceIds.length > 0) {
      // Parameterised tuple list — IDs are bound, never interpolated into SQL.
      const tuples = Prisma.join(
        allowedSourceIds.map(
          ({ sourceType, sourceId }) =>
            Prisma.sql`(${sourceType}::"EmbeddingSourceType", ${sourceId})`,
        ),
      )

      const results = await this.prisma.$queryRaw<Result[]>(Prisma.sql`
      SELECT
        e."sourceType",
        e."sourceId",
        e."content",
        1 - (e."vector" <=> ${vector}::vector) AS similarity
      FROM "Embedding" e
      WHERE (e."sourceType", e."sourceId") IN (${tuples})
      -- Order by the raw distance operator (ASC = closest first) so the HNSW
      -- index can serve the sort; ordering by the derived similarity column
      -- would force an exact full-scan KNN instead.
      ORDER BY e."vector" <=> ${vector}::vector
      LIMIT ${limit}
    `)

      return results
    }

    const results = await this.prisma.$queryRaw<Result[]>(Prisma.sql`
    SELECT
      e."sourceType",
      e."sourceId",
      e."content",
      1 - (e."vector" <=> ${vector}::vector) AS similarity
    FROM "Embedding" e
    WHERE (
      (
        e."sourceType" IN ('TASK', 'COMMENT', 'ATTACHMENT')
        AND (e."metadata"->>'projectId') IN (
          SELECT p.id FROM "Project" p
          LEFT JOIN "ProjectCollaborator" pc ON pc."projectId" = p.id
          WHERE pc."userId" = ${userId} OR p."createdById" = ${userId}
        )
      )
      OR
      (
        e."sourceType" = 'PROJECT'
        AND e."sourceId" IN (
          SELECT p.id FROM "Project" p
          LEFT JOIN "ProjectCollaborator" pc ON pc."projectId" = p.id
          WHERE pc."userId" = ${userId} OR p."createdById" = ${userId}
        )
      )
    )
    -- Order by the raw distance operator (ASC = closest first) so the HNSW
    -- index can serve the sort instead of an exact full-scan KNN.
    ORDER BY e."vector" <=> ${vector}::vector
    LIMIT ${limit}
  `)

    return results
  }

  async filterToEmbeddingIds(
    userId: string,
    filters: {
      status?: string[]
      priority?: string[]
      projectId?: string
      sourceTypes?: ('TASK' | 'COMMENT' | 'PROJECT' | 'ATTACHMENT')[]
    },
  ): Promise<{ sourceType: EmbeddingSourceType; sourceId: string }[]> {
    const sourceTypes = filters.sourceTypes ?? ['TASK', 'COMMENT', 'PROJECT', 'ATTACHMENT']
    const result: { sourceType: EmbeddingSourceType; sourceId: string }[] = []

    if (sourceTypes.includes('TASK')) {
      const tasks = await this.prisma.task.findMany({
        where: {
          project: {
            OR: [{ createdById: userId }, { collaborators: { some: { userId } } }],
            ...(filters.projectId ? { id: filters.projectId } : {}),
          },
          ...(filters.status?.length ? { status: { in: filters.status } } : {}),
          ...(filters.priority?.length
            ? { priority: { in: filters.priority as TaskPriority[] } }
            : {}),
        },
        select: { id: true },
      })
      result.push(...tasks.map((t) => ({ sourceType: EmbeddingSourceType.TASK, sourceId: t.id })))
    }

    if (sourceTypes.includes('COMMENT')) {
      const comments = await this.prisma.comment.findMany({
        where: {
          task: {
            project: {
              OR: [{ createdById: userId }, { collaborators: { some: { userId } } }],
              ...(filters.projectId ? { id: filters.projectId } : {}),
            },
            ...(filters.status?.length ? { status: { in: filters.status } } : {}),
            ...(filters.priority?.length
              ? { priority: { in: filters.priority as TaskPriority[] } }
              : {}),
          },
        },
        select: { id: true },
      })
      result.push(
        ...comments.map((c) => ({ sourceType: EmbeddingSourceType.COMMENT, sourceId: c.id })),
      )
    }

    if (sourceTypes.includes('PROJECT')) {
      const projects = await this.prisma.project.findMany({
        where: {
          OR: [{ createdById: userId }, { collaborators: { some: { userId } } }],
          ...(filters.projectId ? { id: filters.projectId } : {}),
        },
        select: { id: true },
      })
      result.push(
        ...projects.map((p) => ({ sourceType: EmbeddingSourceType.PROJECT, sourceId: p.id })),
      )
    }

    if (sourceTypes.includes('ATTACHMENT')) {
      const projectWhere = projectAccessWhere(userId)
      const attachments = await this.prisma.attachment.findMany({
        where: {
          task: {
            project: {
              ...projectWhere,
              ...(filters.projectId ? { id: filters.projectId } : {}),
            },
          },
        },
        select: { id: true },
      })
      result.push(
        ...attachments.map((a) => ({
          sourceType: EmbeddingSourceType.ATTACHMENT,
          sourceId: a.id,
        })),
      )
    }

    return result
  }

  async deleteByTask(taskId: string) {
    await this.prisma.embedding.deleteMany({
      where: {
        OR: [
          { sourceType: EmbeddingSourceType.TASK, sourceId: taskId },
          {
            sourceType: EmbeddingSourceType.COMMENT,
            metadata: { path: ['taskId'], equals: taskId },
          },
          {
            sourceType: EmbeddingSourceType.ATTACHMENT,
            metadata: { path: ['taskId'], equals: taskId },
          },
        ],
      },
    })
  }

  async deleteByProject(projectId: string) {
    await this.prisma.embedding.deleteMany({
      where: {
        OR: [
          { sourceType: EmbeddingSourceType.PROJECT, sourceId: projectId },
          {
            sourceType: EmbeddingSourceType.TASK,
            metadata: { path: ['projectId'], equals: projectId },
          },
          {
            sourceType: EmbeddingSourceType.COMMENT,
            metadata: { path: ['projectId'], equals: projectId },
          },
          {
            sourceType: EmbeddingSourceType.ATTACHMENT,
            metadata: { path: ['projectId'], equals: projectId },
          },
        ],
      },
    })
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Generate a pgvector literal (`[a,b,...]`) for a piece of text. */
  private async embed(content: string): Promise<string> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: content,
    })
    return `[${response.data[0].embedding.join(',')}]`
  }

  private async upsert({
    sourceType,
    sourceId,
    content,
    metadata,
    chunkIndex = 0,
  }: {
    sourceType: EmbeddingSourceType
    sourceId: string
    content: string
    metadata: object
    chunkIndex?: number
  }) {
    const vector = await this.embed(content)

    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "Embedding" ("id", "sourceType", "sourceId", "content", "vector", "metadata", "chunkIndex", "createdAt")
      VALUES (
        gen_random_uuid(),
        ${sourceType}::"EmbeddingSourceType",
        ${sourceId},
        ${content},
        ${vector}::vector,
        ${JSON.stringify(metadata)}::jsonb,
        ${chunkIndex},
        now()
      )
      ON CONFLICT ("sourceType", "sourceId", "chunkIndex") DO UPDATE
        SET "content"  = EXCLUDED."content",
            "vector"   = EXCLUDED."vector",
            "metadata" = EXCLUDED."metadata"
    `)
  }

  private async extractAndChunk(
    buffer: Buffer,
    mimeType: string,
    attachmentId: string,
  ): Promise<string[]> {
    let text: string | null = null

    if (mimeType === 'application/pdf') {
      const parser = new PDFParse({ data: buffer })
      try {
        const result = await parser.getText()
        text = result.text?.trim() || null
      } catch (err) {
        this.logger.warn(`pdf-parse failed for ${attachmentId}: ${err}`)
      } finally {
        await parser.destroy().catch(() => {})
      }

      // PDF with no extractable text (scanned) → use vision model
      if (!text) {
        this.logger.log(`Scanned PDF detected for ${attachmentId}, using CaptionProvider`)
        const caption = await this.captionProvider.describe({
          imageBuffer: buffer,
          mimeType: 'application/pdf',
        })
        return caption.trim() ? [caption] : []
      }
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      try {
        const result = await mammoth.extractRawText({ buffer })
        text = result.value?.trim() || null
      } catch (err) {
        this.logger.warn(`mammoth failed for ${attachmentId}: ${err}`)
      }
    } else {
      // text/plain, text/csv, text/markdown
      text = buffer.toString('utf-8').trim()
    }

    if (!text) return []

    return this.chunkText(text)
  }

  private chunkText(text: string): string[] {
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim())
    if (!paragraphs.length) return text.trim() ? [text.trim()] : []

    const chunks: string[] = []
    let current = ''

    for (const para of paragraphs) {
      if (current.length + para.length + 2 > CHUNK_TARGET_CHARS && current.length > 0) {
        chunks.push(current.trim())
        // carry overlap from the end of the current chunk
        current = `${current.slice(-CHUNK_OVERLAP_CHARS)}\n\n${para}`
      } else {
        current += (current ? '\n\n' : '') + para
      }
    }

    if (current.trim()) chunks.push(current.trim())

    return chunks
  }
}
