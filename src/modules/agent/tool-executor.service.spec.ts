import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from 'src/prisma/prisma.service'
import { CollaboratorsService } from '../collaborators/collaborators.service'
import { CommentsService } from '../comments/comments.service'
import { EmbeddingService } from '../embedding/embedding.service'
import { ProjectsService } from '../projects/projects.service'
import { TasksService } from '../tasks/tasks.service'
import { ToolExecutorService } from './tool-executor.service'

const ACTOR_ID = 'user-123'

describe('ToolExecutorService', () => {
  let service: ToolExecutorService
  let projectsService: jest.Mocked<ProjectsService>
  let tasksService: jest.Mocked<TasksService>
  let commentsService: jest.Mocked<CommentsService>
  let collaboratorsService: jest.Mocked<CollaboratorsService>
  let embeddingService: jest.Mocked<EmbeddingService>
  let prisma: jest.Mocked<PrismaService>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolExecutorService,
        {
          provide: ProjectsService,
          useValue: { create: jest.fn(), findAll: jest.fn(), findById: jest.fn() },
        },
        {
          provide: TasksService,
          useValue: { create: jest.fn() },
        },
        {
          provide: CommentsService,
          useValue: { create: jest.fn() },
        },
        {
          provide: CollaboratorsService,
          useValue: { create: jest.fn() },
        },
        {
          provide: EmbeddingService,
          useValue: { searchSimilar: jest.fn(), filterToEmbeddingIds: jest.fn() },
        },
        {
          provide: PrismaService,
          useValue: {
            project: { findMany: jest.fn(), findFirst: jest.fn() },
            task: { findMany: jest.fn() },
          },
        },
      ],
    }).compile()

    service = module.get<ToolExecutorService>(ToolExecutorService)
    projectsService = module.get(ProjectsService)
    tasksService = module.get(TasksService)
    commentsService = module.get(CommentsService)
    collaboratorsService = module.get(CollaboratorsService)
    embeddingService = module.get(EmbeddingService)
    prisma = module.get(PrismaService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('execute — unknown tool', () => {
    it('should return error for unknown tool name', async () => {
      const result = await service.execute('non_existent_tool', {}, ACTOR_ID)
      expect(result).toEqual({ error: 'Unknown tool: non_existent_tool' })
    })
  })

  describe('search_knowledge_base', () => {
    it('should call searchSimilar without filters when none provided', async () => {
      embeddingService.searchSimilar.mockResolvedValue([
        { sourceType: 'TASK', sourceId: 't1', content: 'Task content', similarity: 0.9 },
      ] as any)

      const result = await service.execute('search_knowledge_base', { query: 'my tasks' }, ACTOR_ID)

      expect(embeddingService.searchSimilar).toHaveBeenCalledWith({
        userId: ACTOR_ID,
        query: 'my tasks',
      })
      expect(result).toEqual({
        results: [{ sourceType: 'TASK', content: 'Task content' }],
      })
    })

    it('should apply filters and return empty if no allowed source ids', async () => {
      embeddingService.filterToEmbeddingIds.mockResolvedValue([])

      const result = await service.execute(
        'search_knowledge_base',
        { query: 'tasks', status: ['TODO'] },
        ACTOR_ID,
      )

      expect(result).toEqual({ results: [] })
      expect(embeddingService.searchSimilar).not.toHaveBeenCalled()
    })

    it('should apply filters and search within allowed source ids', async () => {
      const allowedIds = [{ sourceType: 'TASK' as any, sourceId: 't1' }]
      embeddingService.filterToEmbeddingIds.mockResolvedValue(allowedIds)
      embeddingService.searchSimilar.mockResolvedValue([
        { sourceType: 'TASK', sourceId: 't1', content: 'Task A', similarity: 0.95 },
      ] as any)

      const result = await service.execute(
        'search_knowledge_base',
        { query: 'high priority tasks', priority: ['HIGH'] },
        ACTOR_ID,
      )

      expect(embeddingService.filterToEmbeddingIds).toHaveBeenCalledWith(ACTOR_ID, {
        priority: ['HIGH'],
      })
      expect(embeddingService.searchSimilar).toHaveBeenCalledWith({
        userId: ACTOR_ID,
        query: 'high priority tasks',
        allowedSourceIds: allowedIds,
      })
      expect(result).toEqual({ results: [{ sourceType: 'TASK', content: 'Task A' }] })
    })
  })

  describe('find_project_by_name', () => {
    it('should return matching projects', async () => {
      ;(prisma.project.findMany as jest.Mock).mockResolvedValue([
        { id: 'p1', name: 'My Project', description: 'desc' },
      ])

      const result = await service.execute('find_project_by_name', { name: 'My' }, ACTOR_ID)

      expect(result).toEqual({ projects: [{ id: 'p1', name: 'My Project', description: 'desc' }] })
    })
  })

  describe('find_task', () => {
    it('should return matching tasks', async () => {
      ;(prisma.task.findMany as jest.Mock).mockResolvedValue([
        { id: 't1', title: 'Fix bug', projectId: 'p1', status: 'TODO', priority: 'HIGH' },
      ])

      const result = await service.execute('find_task', { query: 'bug' }, ACTOR_ID)

      expect(result).toEqual({
        tasks: [{ id: 't1', title: 'Fix bug', projectId: 'p1', status: 'TODO', priority: 'HIGH' }],
      })
    })
  })

  describe('create_project', () => {
    it('should create a project and return id and name', async () => {
      projectsService.create.mockResolvedValue({ id: 'p1', name: 'New Project' } as any)

      const result = await service.execute(
        'create_project',
        { name: 'New Project', description: 'desc' },
        ACTOR_ID,
      )

      expect(projectsService.create).toHaveBeenCalledWith(ACTOR_ID, {
        name: 'New Project',
        description: 'desc',
      })
      expect(result).toEqual({ project: { id: 'p1', name: 'New Project' } })
    })
  })

  describe('create_task', () => {
    it('should create a task and return id, title, projectId, status', async () => {
      tasksService.create.mockResolvedValue({
        id: 't1',
        title: 'New task',
        projectId: 'p1',
        status: 'TODO',
      } as any)

      const result = await service.execute(
        'create_task',
        { projectId: 'p1', title: 'New task' },
        ACTOR_ID,
      )

      expect(tasksService.create).toHaveBeenCalledWith({
        actorId: ACTOR_ID,
        projectId: 'p1',
        data: expect.objectContaining({ title: 'New task' }),
      })
      expect(result).toEqual({
        task: { id: 't1', title: 'New task', projectId: 'p1', status: 'TODO' },
      })
    })
  })

  describe('add_comment', () => {
    it('should create a comment and return id, content, taskId', async () => {
      commentsService.create.mockResolvedValue({
        id: 'c1',
        content: 'Nice work!',
        taskId: 't1',
      } as any)

      const result = await service.execute(
        'add_comment',
        { taskId: 't1', content: 'Nice work!' },
        ACTOR_ID,
      )

      expect(commentsService.create).toHaveBeenCalledWith({
        actorId: ACTOR_ID,
        taskId: 't1',
        data: { content: 'Nice work!' },
      })
      expect(result).toEqual({ comment: { id: 'c1', content: 'Nice work!', taskId: 't1' } })
    })
  })

  describe('invite_collaborator', () => {
    it('should return error if actor is not project owner', async () => {
      ;(prisma.project.findFirst as jest.Mock).mockResolvedValue(null)

      const result = await service.execute(
        'invite_collaborator',
        { projectId: 'p1', email: 'user@example.com' },
        ACTOR_ID,
      )

      expect(result).toEqual({
        error: 'Project not found or you are not the project owner',
      })
      expect(collaboratorsService.create).not.toHaveBeenCalled()
    })

    it('should invite collaborator when actor is owner', async () => {
      ;(prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: 'p1' })
      collaboratorsService.create.mockResolvedValue({
        userId: 'u2',
        projectId: 'p1',
        role: 'EDITOR',
      } as any)

      const result = await service.execute(
        'invite_collaborator',
        { projectId: 'p1', email: 'collab@example.com', role: 'EDITOR' },
        ACTOR_ID,
      )

      expect(collaboratorsService.create).toHaveBeenCalledWith({
        projectId: 'p1',
        data: expect.objectContaining({ email: 'collab@example.com' }),
      })
      expect(result).toEqual({
        collaborator: { userId: 'u2', projectId: 'p1', role: 'EDITOR' },
      })
    })

    it('should default to EDITOR role when role is not VIEWER', async () => {
      ;(prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: 'p1' })
      collaboratorsService.create.mockResolvedValue({
        userId: 'u2',
        projectId: 'p1',
        role: 'EDITOR',
      } as any)

      await service.execute('invite_collaborator', { projectId: 'p1', email: 'x@x.com' }, ACTOR_ID)

      const callArg = collaboratorsService.create.mock.calls[0][0]
      expect(callArg.data.role).toBe('EDITOR')
    })
  })

  describe('error handling', () => {
    it('should return error object when underlying service throws', async () => {
      tasksService.create.mockRejectedValue(new Error('Project not found'))

      const result = await service.execute(
        'create_task',
        { projectId: 'bad-id', title: 'Task' },
        ACTOR_ID,
      )

      expect(result).toEqual({ error: 'Project not found' })
    })
  })
})
