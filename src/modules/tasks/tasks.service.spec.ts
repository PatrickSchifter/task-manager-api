import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { PrismaService } from 'src/prisma/prisma.service'
import { generateKeyBetween } from 'src/utils/fractional-indexing'
import { AttachmentsService } from '../attachments/attachments.service'
import { RagService } from '../rag/rag.service'
import { TagsService } from '../tags/tags.service'
import { TasksRequestDTO } from './tasks.dto'
import { TasksService } from './tasks.service'

const tagsSelect = {
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
}

// Inclui usado em create/update (assignee + tags).
const taskInclude = {
  assignee: { select: { id: true, name: true, email: true, avatar: true } },
  ...tagsSelect,
}

// Campos de um item de lista (espelha `listItemSelect` do service).
const listItemSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  order: true,
  parentId: true,
  dueDate: true,
  assignee: { select: { id: true, name: true, email: true, avatar: true } },
  ...tagsSelect,
  createdAt: true,
  updatedAt: true,
}

describe('TasksService', () => {
  let service: TasksService
  let prismaService: PrismaService
  let ragService: RagService

  const mockTask = {
    id: 'task1',
    title: 'Test Task',
    description: 'Task description',
    status: 'TODO',
    priority: 'MEDIUM',
    order: 'a0',
    parentId: null,
    dueDate: new Date(),
    projectId: 'project1',
    assigneeId: 'user1',
    createdAt: new Date(),
    updatedAt: new Date(),
    assignee: { id: 'user1', name: 'User One', email: 'user1@example.com', avatar: null },
    tags: [],
  }

  const prismaMock: any = {
    task: {
      create: jest.fn().mockResolvedValue(mockTask),
      findMany: jest.fn().mockResolvedValue([mockTask]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(mockTask),
      findUnique: jest.fn().mockResolvedValue(mockTask),
      update: jest.fn().mockResolvedValue(mockTask),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    // assertProjectAccess (autoautorização do service): o ator é dono/colaborador.
    project: {
      findFirst: jest.fn().mockResolvedValue({ id: 'project1' }),
    },
    comment: {
      deleteMany: jest.fn().mockResolvedValue(undefined),
    },
  }

  const ragMock = {
    dispatchTaskEmbedding: jest.fn(),
    dispatchTaskDelete: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RagService, useValue: ragMock },
        { provide: TagsService, useValue: { resolveNames: jest.fn().mockResolvedValue([]) } },
        { provide: AttachmentsService, useValue: { cleanupForTasks: jest.fn() } },
      ],
    }).compile()

    service = module.get<TasksService>(TasksService)
    prismaService = module.get<PrismaService>(PrismaService)
    ragService = module.get<RagService>(RagService)

    jest.clearAllMocks()
    prismaMock.task.findFirst.mockResolvedValue(mockTask)
    prismaMock.task.findMany.mockResolvedValue([mockTask])
    prismaMock.task.count.mockResolvedValue(1)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('create', () => {
    it('should create a top-level task at the top of an empty column', async () => {
      prismaMock.task.findFirst.mockResolvedValue(null)

      const dto: TasksRequestDTO = {
        title: 'New Task',
        description: 'New task description',
        status: 'IN_PROGRESS' as any,
        priority: 'HIGH' as any,
        dueDate: '2026-06-15',
        assigneeId: 'user1',
      }

      await service.create({ actorId: 'user1', data: dto, projectId: 'project1' })

      // Coluna escopada por parentId: null (top-level).
      expect(prismaService.task.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'project1', status: 'IN_PROGRESS', parentId: null },
        orderBy: { order: 'asc' },
        select: { order: true },
      })
      expect(prismaService.task.create).toHaveBeenCalledWith({
        data: {
          title: 'New Task',
          description: 'New task description',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          assigneeId: 'user1',
          order: generateKeyBetween(null, null),
          parentId: null,
          dueDate: new Date('2026-06-15T00:00:00.000Z'),
          projectId: 'project1',
        },
        include: taskInclude,
      })
      // Sem pai → só o embedding da própria task.
      expect(ragService.dispatchTaskEmbedding).toHaveBeenCalledTimes(1)
    })

    it('should default to TODO, ignore position and insert before the current first', async () => {
      prismaMock.task.findFirst.mockResolvedValue({ order: 'a0' })

      const dto: TasksRequestDTO = {
        title: 'No Due Date Task',
        description: 'desc',
        priority: 'LOW' as any,
        assigneeId: 'user1',
        position: 5,
      }

      await service.create({ actorId: 'user1', data: dto, projectId: 'project1' })

      expect(prismaService.task.create).toHaveBeenCalledWith({
        data: {
          title: 'No Due Date Task',
          description: 'desc',
          priority: 'LOW',
          assigneeId: 'user1',
          status: 'TODO',
          order: generateKeyBetween(null, 'a0'),
          parentId: null,
          dueDate: undefined,
          projectId: 'project1',
        },
        include: taskInclude,
      })
    })

    it('should create a subtask under a valid parent and reindex the parent', async () => {
      // 1ª findFirst: validação do pai (parentId null = pode ter filhos).
      // 2ª findFirst: primeiro item da coluna de subtarefas (vazia).
      prismaMock.task.findFirst
        .mockResolvedValueOnce({ parentId: null })
        .mockResolvedValueOnce(null)

      const dto: TasksRequestDTO = { title: 'Subtask', assigneeId: 'user1', parentId: 'task1' }

      await service.create({ actorId: 'user1', data: dto, projectId: 'project1' })

      // Validação do pai no mesmo projeto.
      expect(prismaService.task.findFirst).toHaveBeenNthCalledWith(1, {
        where: { id: 'task1', projectId: 'project1' },
        select: { parentId: true },
      })
      // Coluna de ordenação escopada pelo parentId.
      expect(prismaService.task.findFirst).toHaveBeenNthCalledWith(2, {
        where: { projectId: 'project1', status: 'TODO', parentId: 'task1' },
        orderBy: { order: 'asc' },
        select: { order: true },
      })
      expect(prismaService.task.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ parentId: 'task1' }) }),
      )
      // Reindexa a subtarefa e o pai.
      expect(ragService.dispatchTaskEmbedding).toHaveBeenCalledWith('task1')
      expect(ragService.dispatchTaskEmbedding).toHaveBeenCalledTimes(2)
    })

    it('should reject a subtask whose parent is itself a subtask (1-level rule)', async () => {
      prismaMock.task.findFirst.mockResolvedValueOnce({ parentId: 'grandparent' })

      const dto: TasksRequestDTO = { title: 'Deep', assigneeId: 'user1', parentId: 'task1' }

      await expect(
        service.create({ actorId: 'user1', data: dto, projectId: 'project1' }),
      ).rejects.toThrow(BadRequestException)
      expect(prismaService.task.create).not.toHaveBeenCalled()
    })

    it('should reject a subtask when the parent does not exist', async () => {
      prismaMock.task.findFirst.mockResolvedValueOnce(null)

      const dto: TasksRequestDTO = { title: 'Orphan', assigneeId: 'user1', parentId: 'missing' }

      await expect(
        service.create({ actorId: 'user1', data: dto, projectId: 'project1' }),
      ).rejects.toThrow(NotFoundException)
      expect(prismaService.task.create).not.toHaveBeenCalled()
    })
  })

  describe('findAllByProjectId', () => {
    it('returns only top-level tasks with a subtask progress counter', async () => {
      prismaMock.task.count.mockResolvedValue(1)
      prismaMock.task.findMany.mockResolvedValue([
        { ...mockTask, subtasks: [{ status: 'DONE' }, { status: 'TODO' }, { status: 'DONE' }] },
      ])

      const query: QueryPaginationDTO = { page: '1', limit: '10' }
      const result = await service.findAllByProjectId({ projectId: 'project1', query })

      expect(prismaService.task.findMany).toHaveBeenCalledWith({
        where: { projectId: 'project1', parentId: null },
        skip: 0,
        take: 10,
        orderBy: [{ status: 'asc' }, { order: 'asc' }],
        select: { ...listItemSelect, subtasks: { select: { status: true } } },
      })
      expect(result.data[0].subtaskProgress).toEqual({ done: 2, total: 3 })
      // O array de subtarefas não vaza no item de lista.
      expect((result.data[0] as any).subtasks).toBeUndefined()
    })
  })

  describe('findById', () => {
    it('embeds subtasks and progress in the task detail', async () => {
      prismaMock.task.findFirst.mockResolvedValue({
        ...mockTask,
        comments: [],
        subtasks: [
          { ...mockTask, id: 's1', status: 'DONE', parentId: 'task1', tags: [] },
          { ...mockTask, id: 's2', status: 'TODO', parentId: 'task1', tags: [] },
        ],
      })

      const result: any = await service.findById({ id: 'task1', projectId: 'project1' })

      expect(result.subtasks).toHaveLength(2)
      expect(result.subtaskProgress).toEqual({ done: 1, total: 2 })
    })
  })

  describe('findSubtasks', () => {
    it('lists subtasks of a task scoped by parentId', async () => {
      prismaMock.task.findMany.mockResolvedValue([
        { ...mockTask, id: 's1', parentId: 'task1', tags: [] },
      ])

      const result = await service.findSubtasks({ taskId: 'task1', projectId: 'project1' })

      expect(prismaService.task.findMany).toHaveBeenCalledWith({
        where: { projectId: 'project1', parentId: 'task1' },
        orderBy: { order: 'asc' },
        select: listItemSelect,
      })
      expect(result).toHaveLength(1)
    })
  })

  describe('update', () => {
    it('should do a plain update when neither status nor position changes', async () => {
      prismaMock.task.findFirst.mockResolvedValue({ status: 'TODO', parentId: null })

      const dto: TasksRequestDTO = {
        title: 'Updated Task',
        description: 'Updated description',
        priority: 'HIGH' as any,
        dueDate: '2026-07-01',
        assigneeId: 'user2',
      }

      await service.update({ id: 'task1', actorId: 'user1', data: dto, projectId: 'project1' })

      expect(prismaService.task.findMany).not.toHaveBeenCalled()
      expect(prismaService.task.update).toHaveBeenCalledWith({
        where: { id: 'task1', projectId: 'project1' },
        data: {
          title: 'Updated Task',
          description: 'Updated description',
          priority: 'HIGH',
          assigneeId: 'user2',
          dueDate: new Date('2026-07-01T00:00:00.000Z'),
        },
        include: taskInclude,
      })
    })

    it('scopes sibling reordering by parentId (subtask reorder within its parent)', async () => {
      prismaMock.task.findFirst.mockResolvedValue({ status: 'TODO', parentId: 'task1' })
      prismaMock.task.findMany.mockResolvedValue([{ order: 'a0' }, { order: 'a1' }])

      const dto: TasksRequestDTO = { title: 'Reorder', position: 1, assigneeId: 'user1' }

      await service.update({ id: 'sub1', actorId: 'user1', data: dto, projectId: 'project1' })

      expect(prismaService.task.findMany).toHaveBeenCalledWith({
        where: { projectId: 'project1', status: 'TODO', parentId: 'task1', id: { not: 'sub1' } },
        orderBy: { order: 'asc' },
        select: { order: true },
      })
      expect(prismaService.task.update).toHaveBeenCalledWith({
        where: { id: 'sub1', projectId: 'project1' },
        data: {
          title: 'Reorder',
          assigneeId: 'user1',
          dueDate: undefined,
          status: 'TODO',
          order: generateKeyBetween('a0', 'a1'),
        },
        include: taskInclude,
      })
      // Reindexa a subtarefa e o pai.
      expect(ragService.dispatchTaskEmbedding).toHaveBeenCalledWith('task1')
    })

    it('ignores parentId in the payload (no reparenting)', async () => {
      prismaMock.task.findFirst.mockResolvedValue({ status: 'TODO', parentId: null })

      const dto: TasksRequestDTO = {
        title: 'NoReparent',
        parentId: 'other',
        assigneeId: 'user1',
      } as any

      await service.update({ id: 'task1', actorId: 'user1', data: dto, projectId: 'project1' })

      const updateArg = (prismaService.task.update as jest.Mock).mock.calls[0][0]
      expect(updateArg.data).not.toHaveProperty('parentId')
    })
  })

  describe('delete', () => {
    it('cascades to subtasks: clears comments, deletes, and reindexes embeddings', async () => {
      prismaMock.task.findFirst.mockResolvedValue({
        parentId: null,
        subtasks: [{ id: 's1' }, { id: 's2' }],
      })

      await service.delete({ actorId: 'user1', id: 'task1', projectId: 'project1' })

      // Comentários do pai + subtarefas removidos antes do delete.
      expect(prismaService.comment.deleteMany).toHaveBeenCalledWith({
        where: { taskId: { in: ['task1', 's1', 's2'] } },
      })
      expect(prismaService.task.delete).toHaveBeenCalledWith({
        where: { id: 'task1', projectId: 'project1' },
      })
      // Embeddings da task e de cada subtarefa removidos.
      expect(ragService.dispatchTaskDelete).toHaveBeenCalledWith('task1')
      expect(ragService.dispatchTaskDelete).toHaveBeenCalledWith('s1')
      expect(ragService.dispatchTaskDelete).toHaveBeenCalledWith('s2')
      expect(ragService.dispatchTaskDelete).toHaveBeenCalledTimes(3)
    })

    it('reindexes the parent when a subtask is deleted', async () => {
      prismaMock.task.findFirst.mockResolvedValue({ parentId: 'task1', subtasks: [] })

      await service.delete({ actorId: 'user1', id: 'sub1', projectId: 'project1' })

      expect(prismaService.comment.deleteMany).toHaveBeenCalledWith({
        where: { taskId: { in: ['sub1'] } },
      })
      expect(ragService.dispatchTaskDelete).toHaveBeenCalledWith('sub1')
      expect(ragService.dispatchTaskEmbedding).toHaveBeenCalledWith('task1')
    })

    it('throws when the task is not found in the project', async () => {
      prismaMock.task.findFirst.mockResolvedValue(null)

      await expect(
        service.delete({ actorId: 'user1', id: 'nope', projectId: 'project1' }),
      ).rejects.toThrow(NotFoundException)
      expect(prismaService.task.delete).not.toHaveBeenCalled()
    })
  })
})
