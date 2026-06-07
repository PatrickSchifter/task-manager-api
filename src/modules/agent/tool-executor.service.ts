import { Injectable, Logger } from '@nestjs/common'
import { projectAccessWhere } from 'src/common/authorization/project-access'
import { CollaboratorRole, TaskPriority } from 'src/generated/prisma/enums'
import { PrismaService } from 'src/prisma/prisma.service'
import { AddCollaboratorDTO } from '../collaborators/collaborator.dto'
import { CollaboratorsService } from '../collaborators/collaborators.service'
import { AddCommentDTO } from '../comments/comments.dto'
import { CommentsService } from '../comments/comments.service'
import { EmbeddingService } from '../embedding/embedding.service'
import { ProjectsService } from '../projects/projects.service'
import { TasksRequestDTO } from '../tasks/tasks.dto'
import { TasksService } from '../tasks/tasks.service'

interface SearchKnowledgeBaseInput {
  query: string
  status?: string[]
  priority?: string[]
  projectId?: string
  sourceTypes?: ('TASK' | 'COMMENT' | 'PROJECT' | 'ATTACHMENT')[]
}

interface FindProjectByNameInput {
  name: string
}

interface FindTaskInput {
  query: string
  projectId?: string
}

interface CreateProjectInput {
  name: string
  description?: string
}

interface CreateTaskInput {
  projectId: string
  title: string
  description?: string
  status?: string
  priority?: string
  dueDate?: string
}

interface AddCommentInput {
  taskId: string
  content: string
}

interface InviteCollaboratorInput {
  projectId: string
  email: string
  role?: string
}

@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name)

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly tasksService: TasksService,
    private readonly commentsService: CommentsService,
    private readonly collaboratorsService: CollaboratorsService,
    private readonly embeddingService: EmbeddingService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(toolName: string, input: unknown, actorId: string): Promise<unknown> {
    try {
      switch (toolName) {
        case 'search_knowledge_base':
          return await this.searchKnowledgeBase(input as SearchKnowledgeBaseInput, actorId)
        case 'find_project_by_name':
          return await this.findProjectByName(input as FindProjectByNameInput, actorId)
        case 'find_task':
          return await this.findTask(input as FindTaskInput, actorId)
        case 'create_project':
          return await this.createProject(input as CreateProjectInput, actorId)
        case 'create_task':
          return await this.createTask(input as CreateTaskInput, actorId)
        case 'add_comment':
          return await this.addComment(input as AddCommentInput, actorId)
        case 'invite_collaborator':
          return await this.inviteCollaborator(input as InviteCollaboratorInput, actorId)
        default:
          return { error: `Unknown tool: ${toolName}` }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`Tool ${toolName} failed: ${message}`)
      return { error: message }
    }
  }

  private async searchKnowledgeBase(input: SearchKnowledgeBaseInput, actorId: string) {
    const filters = {
      ...(input.status?.length ? { status: input.status } : {}),
      ...(input.priority?.length ? { priority: input.priority } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.sourceTypes?.length ? { sourceTypes: input.sourceTypes } : {}),
    }

    const hasFilters = Object.keys(filters).length > 0

    if (hasFilters) {
      const allowedSourceIds = await this.embeddingService.filterToEmbeddingIds(actorId, filters)
      if (!allowedSourceIds.length) return { results: [] }

      const results = await this.embeddingService.searchSimilar({
        userId: actorId,
        query: input.query,
        allowedSourceIds,
      })
      return { results: results.map((r) => ({ sourceType: r.sourceType, content: r.content })) }
    }

    const results = await this.embeddingService.searchSimilar({
      userId: actorId,
      query: input.query,
    })
    return { results: results.map((r) => ({ sourceType: r.sourceType, content: r.content })) }
  }

  private async findProjectByName(input: FindProjectByNameInput, actorId: string) {
    const projects = await this.prisma.project.findMany({
      where: {
        name: { contains: input.name, mode: 'insensitive' },
        ...projectAccessWhere(actorId),
      },
      select: { id: true, name: true, description: true },
      take: 5,
    })
    return { projects }
  }

  private async findTask(input: FindTaskInput, actorId: string) {
    const tasks = await this.prisma.task.findMany({
      where: {
        title: { contains: input.query, mode: 'insensitive' },
        project: {
          ...projectAccessWhere(actorId),
          ...(input.projectId ? { id: input.projectId } : {}),
        },
      },
      select: { id: true, title: true, projectId: true, status: true, priority: true },
      take: 5,
    })
    return { tasks }
  }

  private async createProject(input: CreateProjectInput, actorId: string) {
    const project = await this.projectsService.create(actorId, {
      name: input.name,
      description: input.description ?? '',
    })
    return { project: { id: project.id, name: project.name } }
  }

  private async createTask(input: CreateTaskInput, actorId: string) {
    const task = await this.tasksService.create({
      actorId,
      projectId: input.projectId,
      data: {
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority as TaskPriority | undefined,
        dueDate: input.dueDate,
      } as TasksRequestDTO,
    })
    return {
      task: { id: task.id, title: task.title, projectId: task.projectId, status: task.status },
    }
  }

  private async addComment(input: AddCommentInput, actorId: string) {
    const comment = await this.commentsService.create({
      actorId,
      taskId: input.taskId,
      data: { content: input.content } as AddCommentDTO,
    })
    return { comment: { id: comment.id, content: comment.content, taskId: comment.taskId } }
  }

  private async inviteCollaborator(input: InviteCollaboratorInput, actorId: string) {
    // Verify the actor is the project owner — CollaboratorsService.create does not enforce this
    const project = await this.prisma.project.findFirst({
      where: { id: input.projectId, createdById: actorId },
      select: { id: true },
    })
    if (!project) {
      return { error: 'Project not found or you are not the project owner' }
    }

    const allowedRole = input.role === 'VIEWER' ? CollaboratorRole.VIEWER : CollaboratorRole.EDITOR

    const collaborator = await this.collaboratorsService.create({
      projectId: input.projectId,
      data: { email: input.email, role: allowedRole } as AddCollaboratorDTO,
    })

    return {
      collaborator: {
        userId: collaborator.userId,
        projectId: collaborator.projectId,
        role: collaborator.role,
      },
    }
  }
}
