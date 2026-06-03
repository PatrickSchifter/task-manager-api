import { Injectable } from '@nestjs/common'
import { PaginatedResponseDTO, QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { PrismaService } from 'src/prisma/prisma.service'
import { paginate, paginateOutput } from 'src/utils/pagination.utils'
import { RagService } from '../rag/rag.service'
import { TaskItemListDTO, TasksRequestDTO } from './tasks.dto'

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
  ) {}

  async create({ data, projectId }: { data: TasksRequestDTO; projectId: string }) {
    const task = await this.prisma.task.create({
      data: {
        ...data,
        dueDate: data.dueDate ? new Date(`${data.dueDate}T00:00:00.000Z`) : undefined,
        projectId,
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    })

    this.ragService.dispatchTaskEmbedding(task.id)

    return task
  }

  async findAllByProjectId({
    projectId,
    query,
  }: {
    projectId: string
    query?: QueryPaginationDTO
  }): Promise<PaginatedResponseDTO<TaskItemListDTO>> {
    const { skip, take } = paginate(query)
    const where = { projectId }

    const tasks = await this.prisma.task.findMany({
      where,
      skip,
      take,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    })
    const total = await this.prisma.task.count({ where })

    return paginateOutput({ data: tasks, total, query })
  }

  findById({ id, projectId }: { id: string; projectId: string }) {
    return this.prisma.task.findFirst({
      where: { id, projectId },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatar: true } },
        comments: {
          include: { author: { select: { id: true, name: true, email: true, avatar: true } } },
        },
      },
    })
  }

  async update({ id, data, projectId }: { id: string; data: TasksRequestDTO; projectId: string }) {
    const parseDueDate = (value?: string): Date | undefined => {
      if (!value) return undefined
      const datePart = value.split('T')[0]
      const parsed = new Date(`${datePart}T00:00:00.000Z`)
      return isNaN(parsed.getTime()) ? undefined : parsed
    }

    const updated = await this.prisma.task.update({
      where: { id, projectId },
      data: {
        ...data,
        dueDate: parseDueDate(data.dueDate),
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatar: true } },
      },
    })

    this.ragService.dispatchTaskEmbedding(updated.id)
    return updated
  }

  async delete({ id, projectId }: { id: string; projectId: string }) {
    await this.prisma.task.findUnique({ where: { id }, include: { comments: true } })
    await this.prisma.comment.deleteMany({ where: { taskId: id } })
    await this.prisma.task.delete({ where: { id, projectId } })
    this.ragService.dispatchTaskDelete(id)
    return
  }
}
