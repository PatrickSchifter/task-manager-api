import { Injectable } from '@nestjs/common'
import { projectAccessWhere } from 'src/common/authorization/project-access'
import { PaginatedResponseDTO, QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { Project } from 'src/generated/prisma/client'
import { CollaboratorRole } from 'src/generated/prisma/enums'
import { PrismaService } from 'src/prisma/prisma.service'
import { paginate, paginateOutput } from 'src/utils/pagination.utils'
import { RagService } from '../rag/rag.service'
import { ProjectDTO } from './projects.dto'

type ProjectListItem = Project & {
  role: CollaboratorRole
  membersCount: number
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
  ) {}

  // `actorId` é o usuário em nome de quem a operação roda. No caminho HTTP vem do
  // JWT (via @AuthenticatedUser no controller); no caminho da fila (chat/MCP) vem
  // do payload da mensagem. Os services não dependem mais do request-scope.
  async findAll(
    actorId: string,
    query?: QueryPaginationDTO,
  ): Promise<PaginatedResponseDTO<ProjectListItem>> {
    const userId = actorId

    const { skip, take } = paginate(query)

    const where = projectAccessWhere(userId)

    const projects = await this.prisma.project.findMany({
      where,
      skip,
      take,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        _count: { select: { collaborators: true } },
        collaborators: {
          where: { userId },
          select: { role: true },
        },
      },
    })

    const total = await this.prisma.project.count({
      where,
    })

    const data: ProjectListItem[] = projects.map(({ _count, collaborators, ...project }) => ({
      ...project,
      membersCount: _count.collaborators,
      role:
        collaborators[0]?.role ??
        (project.createdById === userId ? CollaboratorRole.OWNER : CollaboratorRole.VIEWER),
    }))

    return paginateOutput({ data, total, query })
  }

  async findById(actorId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id,
        ...projectAccessWhere(actorId),
      },
      select: {
        tasks: {
          // Apenas tarefas top-level viram cards no Kanban; subtarefas
          // (parentId != null) são gerenciadas na página de detalhe do pai.
          where: { parentId: null },
          orderBy: [{ status: 'asc' }, { order: 'asc' }],
          select: {
            title: true,
            description: true,
            id: true,
            parentId: true,
            dueDate: true,
            createdAt: true,
            updatedAt: true,
            priority: true,
            status: true,
            order: true,
            comments: true,
            assignee: true,
            tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
            // Status das subtarefas → indicador de progresso "3/5" no card.
            subtasks: { select: { status: true } },
          },
        },
        collaborators: {
          select: {
            user: { select: { name: true, email: true, id: true } },
            role: true,
            id: true,
            userId: true,
            projectId: true,
          },
        },
        createdAt: true,
        updatedAt: true,
        name: true,
        description: true,
        id: true,
        createdById: true,
      },
    })

    if (!project) return project

    // Achata as tags de cada task (TaskTag[] → TagDTO[]) e troca o array de
    // subtarefas pelo contador `subtaskProgress` (done/total), mesmo formato do
    // endpoint de tasks.
    return {
      ...project,
      tasks: project.tasks.map(({ subtasks, ...task }) => ({
        ...task,
        tags: task.tags.map((t) => t.tag),
        subtaskProgress: {
          done: subtasks.filter((s) => s.status === 'DONE').length,
          total: subtasks.length,
        },
      })),
    }
  }

  async create(actorId: string, data: ProjectDTO) {
    const project = await this.prisma.project.create({
      data: { ...data, createdById: actorId },
    })

    await this.prisma.projectCollaborator.create({
      data: {
        projectId: project.id,
        userId: project.createdById,
        role: CollaboratorRole.OWNER,
      },
    })

    if (data.description) {
      this.ragService.dispatchProjectEmbedding(project.id)
    }

    return project
  }

  async update(actorId: string, id: string, data: ProjectDTO) {
    const updated = await this.prisma.project.update({ where: { id, createdById: actorId }, data })

    if (data.description) this.ragService.dispatchProjectEmbedding(id)

    return updated
  }

  async delete(actorId: string, id: string) {
    const project = await this.prisma.project.findFirst({ where: { id } })

    if (project?.createdById === actorId) {
      await this.prisma.projectCollaborator.deleteMany({ where: { projectId: id } })
      await this.prisma.comment.deleteMany({ where: { task: { projectId: id } } })
      await this.prisma.task.deleteMany({ where: { projectId: id } })
    }

    await this.prisma.project.delete({ where: { id, createdById: actorId } })
    this.ragService.dispatchProjectDelete(id)
    return
  }
}
