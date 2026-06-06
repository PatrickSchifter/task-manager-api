import { Injectable, NotFoundException } from '@nestjs/common'
import { projectAccessWhere } from 'src/common/authorization/project-access'
import { PaginatedResponseDTO, QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { Comment } from 'src/generated/prisma/client'
import { PrismaService } from 'src/prisma/prisma.service'
import { paginate, paginateOutput } from 'src/utils/pagination.utils'
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
  ) {}

  // Autoriza o ator a comentar na task: a task precisa existir e pertencer a um
  // projeto onde o ator é dono ou colaborador. No HTTP o
  // ValidateResourcesIdsInterceptor já validou; repetido aqui para que o service
  // seja seguro ao ser chamado fora da request (consumer da fila chat/MCP).
  private async assertTaskAccess(actorId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: projectAccessWhere(actorId) },
      select: { id: true },
    })
    if (!task) throw new NotFoundException('Task not found')
  }

  async create({ actorId, data, taskId }: { actorId: string; data: AddCommentDTO; taskId: string }) {
    await this.assertTaskAccess(actorId, taskId)
    const comment = await this.prisma.comment.create({
      data: {
        ...data,
        task: { connect: { id: taskId } },
        author: { connect: { id: actorId } },
      },
      include: { author: authorAttributes },
    })
    this.ragService.dispatchCommentEmbedding(comment.id)
    return comment
  }

  findById(taskId: string) {
    return this.prisma.comment.findFirst({
      where: {
        taskId,
      },
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
      where: {
        authorId,
      },
      include: { author: authorAttributes },
    })
  }

  async update({ actorId, data, id }: { actorId: string; data: UpdateCommentDTO; id: string }) {
    const comment = await this.prisma.comment.findFirst({ where: { id } })
    if (!comment) throw new NotFoundException('Comment not found')

    const updated = await this.prisma.comment.update({
      where: {
        id,
        authorId: actorId,
      },
      data,
      include: { author: authorAttributes },
    })

    this.ragService.dispatchCommentEmbedding(comment.id)

    return updated
  }

  async delete({ actorId, id }: { actorId: string; id: string }) {
    const comment = await this.prisma.comment.findFirst({ where: { id, authorId: actorId } })

    if (!comment) throw new NotFoundException('Comment not found')

    await this.prisma.comment.delete({ where: { id, authorId: actorId } })
    this.ragService.dispatchDelete('COMMENT', id)

    return
  }
}
