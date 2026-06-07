import { Injectable, NotFoundException } from '@nestjs/common'
import { projectAccessWhere } from 'src/common/authorization/project-access'
import { PaginatedResponseDTO, QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { Comment, StorageProvider } from 'src/generated/prisma/client'
import { PrismaService } from 'src/prisma/prisma.service'
import { paginate, paginateOutput } from 'src/utils/pagination.utils'
import { AttachmentsService } from '../attachments/attachments.service'
import { RagService } from '../rag/rag.service'
import { AddCommentDTO, UpdateCommentDTO } from './comments.dto'

const authorAttributes = {
  select: {
    id: true,
    name: true,
    email: true,
    avatar: true,
  },
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  private async assertTaskAccess(actorId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: projectAccessWhere(actorId) },
      select: { id: true },
    })
    if (!task) throw new NotFoundException('Task not found')
  }

  async create({
    actorId,
    data,
    taskId,
    files = [],
  }: {
    actorId: string
    data: AddCommentDTO
    taskId: string
    files?: Express.Multer.File[]
  }) {
    await this.assertTaskAccess(actorId, taskId)

    // 1. Validate all files upfront (throws BadRequestException on failure)
    const filesMeta = files.map((f) => ({ file: f, ...this.attachmentsService.validateFile(f) }))

    // 2. Upload files to storage (outside DB transaction)
    const uploadedFiles: {
      file: Express.Multer.File
      tempId: string
      provider: StorageProvider
      storageKey: string
      url: string | null
    }[] = []

    for (const { file, isImage } of filesMeta) {
      const tempId = crypto.randomUUID()
      try {
        const stored = await this.attachmentsService.uploadToStorage(file, tempId, taskId, isImage)
        uploadedFiles.push({ file, tempId, ...stored })
      } catch (err) {
        // Cleanup already-uploaded files then rethrow
        for (const u of uploadedFiles) {
          await this.attachmentsService
            .deleteStorageFile({ provider: u.provider, storageKey: u.storageKey })
            .catch(() => {})
        }
        throw err
      }
    }

    // 3. DB transaction: create Comment + Attachments atomically
    let comment: Comment & {
      author: { id: string; name: string; email: string; avatar: string | null }
    }
    let attachmentIds: string[]

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const c = await tx.comment.create({
          data: {
            ...data,
            task: { connect: { id: taskId } },
            author: { connect: { id: actorId } },
          },
          include: { author: authorAttributes },
        })

        const createdAttachments = await Promise.all(
          uploadedFiles.map(({ file, tempId, provider, storageKey, url }) =>
            tx.attachment.create({
              data: {
                id: tempId,
                fileName: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
                provider,
                storageKey,
                url,
                taskId,
                commentId: c.id,
                uploadedById: actorId,
              },
              select: { id: true },
            }),
          ),
        )

        return { c, attachmentIds: createdAttachments.map((a) => a.id) }
      })

      comment = result.c as Comment & {
        author: { id: string; name: string; email: string; avatar: string | null }
      }
      attachmentIds = result.attachmentIds
    } catch (err) {
      // DB failed after storage upload — best-effort cleanup
      for (const u of uploadedFiles) {
        await this.attachmentsService
          .deleteStorageFile({ provider: u.provider, storageKey: u.storageKey })
          .catch(() => {})
      }
      throw err
    }

    // 4. Dispatch embeddings asynchronously
    this.ragService.dispatchCommentEmbedding(comment.id)
    for (const id of attachmentIds) {
      this.ragService.dispatchAttachmentEmbedding(id)
    }

    return comment
  }

  findById(taskId: string) {
    return this.prisma.comment.findFirst({
      where: { taskId },
      include: {
        author: authorAttributes,
        task: { select: { id: true, title: true, projectId: true } },
      },
    })
  }

  async findByTaskId({
    taskId,
    query,
  }: {
    taskId: string
    query?: QueryPaginationDTO
  }): Promise<PaginatedResponseDTO<Comment>> {
    const { skip, take } = paginate(query)
    const where = { taskId }

    const total = await this.prisma.comment.count({ where })
    const comments = await this.prisma.comment.findMany({
      where,
      skip,
      take,
      include: { author: authorAttributes },
    })

    return paginateOutput({ data: comments, total, query })
  }

  findByAuthorId(authorId: string) {
    return this.prisma.comment.findMany({
      where: { authorId },
      include: { author: authorAttributes },
    })
  }

  async update({ actorId, data, id }: { actorId: string; data: UpdateCommentDTO; id: string }) {
    const comment = await this.prisma.comment.findFirst({ where: { id } })
    if (!comment) throw new NotFoundException('Comment not found')

    const updated = await this.prisma.comment.update({
      where: { id, authorId: actorId },
      data,
      include: { author: authorAttributes },
    })

    this.ragService.dispatchCommentEmbedding(comment.id)
    return updated
  }

  async delete({ actorId, id }: { actorId: string; id: string }) {
    const comment = await this.prisma.comment.findFirst({ where: { id, authorId: actorId } })
    if (!comment) throw new NotFoundException('Comment not found')

    // Clean up attachment files + dispatch embedding deletions BEFORE DB cascade
    await this.attachmentsService.cleanupForComment(id)

    await this.prisma.comment.delete({ where: { id, authorId: actorId } })
    this.ragService.dispatchDelete('COMMENT', id)
  }
}
