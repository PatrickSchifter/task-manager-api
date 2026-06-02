import { Injectable } from '@nestjs/common'
import { PaginatedResponseDTO, QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { Project } from 'src/generated/prisma/client'
import { CollaboratorRole } from 'src/generated/prisma/enums'
import { PrismaService } from 'src/prisma/prisma.service'
import { paginate, paginateOutput } from 'src/utils/pagination.utils'
import { RagService } from '../rag/rag.service'
import { ProjectDTO } from './projects.dto'

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly ragService: RagService,
  ) {}

  async findAll(query?: QueryPaginationDTO): Promise<PaginatedResponseDTO<Project>> {
    const userId = this.requestContext.getUserId()

    const { skip, take } = paginate(query)

    const where = {
      OR: [
        { createdById: userId },
        {
          collaborators: {
            some: {
              userId: userId,
            },
          },
        },
      ],
    }

    const projects = await this.prisma.project.findMany({
      where,
      skip,
      take,
      orderBy: {
        createdAt: 'desc',
      },
    })

    const total = await this.prisma.project.count({
      where,
    })

    return paginateOutput({ data: projects, total, query })
  }

  findById(id: string) {
    const userId = this.requestContext.getUserId()

    return this.prisma.project.findFirst({
      where: {
        id,
        OR: [
          { createdById: userId },
          {
            collaborators: {
              some: {
                userId: userId,
              },
            },
          },
        ],
      },
      select: {
        tasks: {
          select: {
            title: true,
            description: true,
            id: true,
            dueDate: true,
            createdAt: true,
            updatedAt: true,
            priority: true,
            status: true,
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
  }

  async create(data: ProjectDTO) {
    const userId = this.requestContext.getUserId()
    const project = await this.prisma.project.create({
      data: { ...data, createdById: userId },
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

  async update(id: string, data: ProjectDTO) {
    const userId = this.requestContext.getUserId()
    const updated = await this.prisma.project.update({ where: { id, createdById: userId }, data })

    if (data.description) this.ragService.dispatchProjectEmbedding(id)

    return updated
  }

  async delete(id: string) {
    const userId = this.requestContext.getUserId()
    const project = await this.prisma.project.findFirst({ where: { id } })

    if (project?.createdById === userId) {
      await this.prisma.projectCollaborator.deleteMany({ where: { projectId: id } })
      await this.prisma.comment.deleteMany({ where: { task: { projectId: id } } })
      await this.prisma.task.deleteMany({ where: { projectId: id } })
    }

    await this.prisma.project.delete({ where: { id, createdById: userId } })
    this.ragService.dispatchProjectDelete(id)
    return
  }
}
