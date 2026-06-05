import { Injectable, NotFoundException } from '@nestjs/common'
import { PaginatedResponseDTO, QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { TaskStatus } from 'src/generated/prisma/enums'
import { PrismaService } from 'src/prisma/prisma.service'
import { generateKeyBetween } from 'src/utils/fractional-indexing'
import { paginate, paginateOutput } from 'src/utils/pagination.utils'
import { RagService } from '../rag/rag.service'
import { TaskItemListDTO, TasksRequestDTO } from './tasks.dto'

const assigneeSelect = {
  assignee: { select: { id: true, name: true, email: true, avatar: true } },
}

const parseDueDate = (value?: string): Date | undefined => {
  if (!value) return undefined
  const datePart = value.split('T')[0]
  const parsed = new Date(`${datePart}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
  ) {}

  async create({ data, projectId }: { data: TasksRequestDTO; projectId: string }) {
    // Uma nova task sempre entra no topo da sua coluna: gera uma chave fracionária
    // anterior à do primeiro item da coluna. `position` do payload é ignorado aqui.
    const { position: _ignoredPosition, ...rest } = data
    const status = data.status ?? TaskStatus.TODO

    const first = await this.prisma.task.findFirst({
      where: { projectId, status },
      orderBy: { order: 'asc' },
      select: { order: true },
    })
    const order = generateKeyBetween(null, first?.order ?? null)

    const task = await this.prisma.task.create({
      data: {
        ...rest,
        status,
        order,
        dueDate: parseDueDate(data.dueDate),
        projectId,
      },
      include: assigneeSelect,
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
      orderBy: [{ status: 'asc' }, { order: 'asc' }],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        order: true,
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
    const { position, ...rest } = data
    const baseData = { ...rest, dueDate: parseDueDate(data.dueDate) }

    const current = await this.prisma.task.findFirst({
      where: { id, projectId },
      select: { status: true },
    })
    if (!current) throw new NotFoundException('Task not found')

    const targetStatus = data.status ?? current.status
    const statusChanged = targetStatus !== current.status
    const positionProvided = position !== undefined

    // Nada que afete a ordenação mudou: um update simples basta.
    if (!statusChanged && !positionProvided) {
      const updated = await this.prisma.task.update({
        where: { id, projectId },
        data: baseData,
        include: assigneeSelect,
      })
      this.ragService.dispatchTaskEmbedding(updated.id)
      return updated
    }

    // Com fractional indexing, reordenar é UMA escrita: basta calcular a chave
    // entre os vizinhos da posição alvo (na coluna de destino, sem a própria task).
    const siblings = await this.prisma.task.findMany({
      where: { projectId, status: targetStatus, id: { not: id } },
      orderBy: { order: 'asc' },
      select: { order: true },
    })

    // Posição alvo: índice pedido, ou topo (0) quando só o status mudou.
    const idx = Math.max(0, Math.min(positionProvided ? (position as number) : 0, siblings.length))
    const prevKey = idx > 0 ? siblings[idx - 1].order : null
    const nextKey = idx < siblings.length ? siblings[idx].order : null
    const order = generateKeyBetween(prevKey, nextKey)

    const updated = await this.prisma.task.update({
      where: { id, projectId },
      data: { ...baseData, status: targetStatus, order },
      include: assigneeSelect,
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
