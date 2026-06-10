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
  sourceTypes?: ('TASK' | 'COMMENT' | 'PROJECT' | 'ATTACHMENT' | 'ROUTINE')[]
}

interface ExplainPlatformFeatureInput {
  feature: 'overview' | 'projects' | 'tasks' | 'routines' | 'chat'
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
        case 'explain_platform_feature':
          return this.explainPlatformFeature(input as ExplainPlatformFeatureInput)
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

  private explainPlatformFeature({ feature }: ExplainPlatformFeatureInput) {
    const docs: Record<string, string> = {
      overview: `
## Platform Overview
This is a project management platform with AI assistance. Main features:
- **Projects**: Organize work into projects with Kanban boards and collaborators.
- **Tasks**: Create and manage tasks with status, priority, due dates, subtasks, tags, comments, and file attachments.
- **Routines**: Track personal recurring daily activities (e.g. "Drink water") with flexible time slots and day-of-week scheduling.
- **Chat**: An AI assistant that can answer questions about your data, create tasks/projects, and explain platform features.
      `.trim(),

      projects: `
## Projects
Projects are workspaces that group related tasks. Key concepts:
- **Create**: Give a name and optional description. You become the owner automatically.
- **Kanban board**: Tasks are organized in columns by status (Todo, In Progress, Done — customizable per project).
- **Collaborators**: Invite team members by email with VIEWER or EDITOR roles. Only the owner can invite.
- **Statuses**: Each project can have its own custom task statuses with a defined order.
- **Access control**: Only owners and collaborators can see or modify a project's tasks.
      `.trim(),

      tasks: `
## Tasks
Tasks live inside projects and represent individual work items.
- **Fields**: Title (required), description, status, priority (Low/Medium/High), due date, assignee.
- **Subtasks**: A task can have one level of subtasks. Subtasks cannot have their own subtasks.
- **Tags**: Color-coded labels reusable across projects (owned per user). Assigned to tasks for filtering/search.
- **Comments**: Text discussions on a task. Each comment can have file attachments.
- **Attachments**: Upload files (PDF, Word, images, text) directly to tasks or comments. Files are processed and indexed for AI search.
- **Ordering**: Tasks within a column can be reordered via drag-and-drop (fractional index ordering).
- **Status columns**: Columns come from the project's status list. Moving a task between columns changes its status.
      `.trim(),

      routines: `
## Routines
Routines track personal recurring daily activities — things you do every day (or specific days) at scheduled times.
- **Create**: Give a title (e.g. "Tomar água"), optional description, and add one or more time slots.
- **Time slots**: Each slot has a start time and end time (e.g. 08:00–08:30). Add as many slots per day as needed.
- **Days of the week**: Choose which days the routine is active (Mon–Sun). Leaving all days unselected means every day.
- **Completing a slot**: On the routines page, click the circle icon next to a time slot to mark it as done for today. Click again to undo.
- **Progress counter**: Each card shows how many slots were completed today (e.g. "2/3").
- **Pause**: Routines can be paused without losing their completion history.
- **History**: Every completion is stored per (time slot, date), so you can track historical adherence.
      `.trim(),

      chat: `
## AI Chat Assistant
The chat assistant understands natural language and interacts with your project data.
**What it can do:**
- Answer questions about your tasks, projects, comments, attachments, and routines using semantic search.
- Create projects, tasks, and comments on your behalf.
- Invite collaborators to projects you own.
- Explain how any platform feature works (just ask).

**Tips:**
- Be specific: "What tasks are overdue in project X?" works better than "what's late?".
- Semantic search means "what did I write about the login bug?" finds relevant comments even without exact word matches.
- For routines: "What routines do I have in the morning?" or "Do I have any water-drinking reminders?" will find your routines.
- Actions (create task, add comment) only happen when you explicitly ask and the tool call succeeds.
      `.trim(),
    }

    const content = docs[feature]
    if (!content) return { error: `Unknown feature: ${feature}` }
    return { feature, documentation: content }
  }
}
