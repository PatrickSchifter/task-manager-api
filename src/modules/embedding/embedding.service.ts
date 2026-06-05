import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import { EmbeddingSourceType, Prisma } from 'src/generated/prisma/client'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class EmbeddingService {
  private readonly openai: OpenAI
  private readonly logger = new Logger(EmbeddingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
      },
    })

    if (!task) throw new NotFoundException(`Task ${taskId} not found`)

    const tagNames = task.tags.map((t) => t.tag.name)

    const content = [
      `Title: ${task.title}`,
      task.description ? `Description: ${task.description}` : null,
      `Status: ${task.status}`,
      `Priority: ${task.priority}`,
      `Project: ${task.project.name}`,
      task.assignee ? `Assignee: ${task.assignee.name}` : null,
      task.dueDate ? `Due date: ${task.dueDate.toISOString().split('T')[0]}` : null,
      tagNames.length ? `Tags: ${tagNames.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const metadata = {
      projectId: task.projectId,
      assigneeId: task.assigneeId,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate?.toISOString() ?? null,
    }

    await this.upsert({
      sourceType: EmbeddingSourceType.TASK,
      sourceId: taskId,
      content,
      metadata,
    })
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
      include: {
        createdBy: { select: { name: true } },
      },
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

    const metadata = {
      createdById: project.createdById,
    }

    await this.upsert({
      sourceType: EmbeddingSourceType.PROJECT,
      sourceId: projectId,
      content,
      metadata,
    })
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
      const values = allowedSourceIds
        .map(
          ({ sourceType, sourceId }) => `('${sourceType}'::"EmbeddingSourceType", '${sourceId}')`,
        )
        .join(', ')

      const results = await this.prisma.$queryRaw<Result[]>(Prisma.sql`
      SELECT
        e."sourceType",
        e."sourceId",
        e."content",
        1 - (e."vector" <=> ${vector}::vector) AS similarity
      FROM "Embedding" e
      WHERE (e."sourceType", e."sourceId") IN (${Prisma.raw(values)})
      ORDER BY similarity DESC
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
        e."sourceType" IN ('TASK', 'COMMENT')
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
    ORDER BY similarity DESC
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
      sourceTypes?: ('TASK' | 'COMMENT' | 'PROJECT')[]
    },
  ): Promise<{ sourceType: EmbeddingSourceType; sourceId: string }[]> {
    const sourceTypes = filters.sourceTypes ?? ['TASK', 'COMMENT', 'PROJECT']
    const result: { sourceType: EmbeddingSourceType; sourceId: string }[] = []

    if (sourceTypes.includes('TASK')) {
      const tasks = await this.prisma.task.findMany({
        where: {
          project: {
            OR: [{ createdById: userId }, { collaborators: { some: { userId } } }],
            ...(filters.projectId ? { id: filters.projectId } : {}),
          },
          ...(filters.status?.length ? { status: { in: filters.status as any } } : {}),
          ...(filters.priority?.length ? { priority: { in: filters.priority as any } } : {}),
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
            ...(filters.status?.length ? { status: { in: filters.status as any } } : {}),
            ...(filters.priority?.length ? { priority: { in: filters.priority as any } } : {}),
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

    return result
  }

  private async upsert({
    sourceType,
    sourceId,
    content,
    metadata,
  }: {
    sourceType: EmbeddingSourceType
    sourceId: string
    content: string
    metadata: object
  }) {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: content,
    })

    const vector = `[${response.data[0].embedding.join(',')}]`

    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "Embedding" ("id", "sourceType", "sourceId", "content", "vector", "metadata", "createdAt")
      VALUES (
        gen_random_uuid(),
        ${sourceType}::"EmbeddingSourceType",
        ${sourceId},
        ${content},
        ${vector}::vector,
        ${JSON.stringify(metadata)}::jsonb,
        now()
      )
      ON CONFLICT ("sourceType", "sourceId") DO UPDATE
        SET "content"  = EXCLUDED."content",
            "vector"   = EXCLUDED."vector",
            "metadata" = EXCLUDED."metadata"
    `)
  }

  async deleteByTask(taskId: string) {
    await this.prisma.embedding.deleteMany({
      where: {
        OR: [
          { sourceType: 'TASK', sourceId: taskId },
          { sourceType: 'COMMENT', metadata: { path: ['taskId'], equals: taskId } },
        ],
      },
    })
  }
  async deleteByProject(projectId: string) {
    await this.prisma.embedding.deleteMany({
      where: {
        OR: [
          { sourceType: 'PROJECT', sourceId: projectId },
          { sourceType: 'TASK', metadata: { path: ['projectId'], equals: projectId } },
          { sourceType: 'COMMENT', metadata: { path: ['projectId'], equals: projectId } },
        ],
      },
    })
  }
}
