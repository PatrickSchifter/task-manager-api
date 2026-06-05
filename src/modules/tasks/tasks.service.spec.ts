import { Test, TestingModule } from '@nestjs/testing'
import { QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { generateKeyBetween } from 'src/utils/fractional-indexing'
import { RagService } from '../rag/rag.service'
import { TagsService } from '../tags/tags.service'
import { TasksRequestDTO } from './tasks.dto'
import { TasksService } from './tasks.service'

const tagsSelect = {
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
}

// Inclui usado em create/update/findById (assignee + tags).
const taskInclude = {
  assignee: { select: { id: true, name: true, email: true, avatar: true } },
  ...tagsSelect,
}

describe('TasksService', () => {
  let service: TasksService
  let prismaService: PrismaService

  const mockTask = {
    id: 'task1',
    title: 'Test Task',
    description: 'Task description',
    status: 'TODO',
    priority: 'MEDIUM',
    order: 'a0',
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
    comment: {
      deleteMany: jest.fn().mockResolvedValue(undefined),
    },
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: RagService,
          useValue: {
            dispatchTaskEmbedding: jest.fn(),
            dispatchTaskDelete: jest.fn(),
          },
        },
        {
          provide: TagsService,
          useValue: {
            resolveNames: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: RequestContextService,
          useValue: {
            getUserId: jest.fn().mockReturnValue('user1'),
          },
        },
      ],
    }).compile()

    service = module.get<TasksService>(TasksService)
    prismaService = module.get<PrismaService>(PrismaService)

    jest.clearAllMocks()
    prismaMock.task.findFirst.mockResolvedValue(mockTask)
    prismaMock.task.findMany.mockResolvedValue([mockTask])
    prismaMock.task.count.mockResolvedValue(1)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('create', () => {
    it('should create a task at the top of an empty column with the first key', async () => {
      prismaMock.task.findFirst.mockResolvedValue(null)

      const createTaskDto: TasksRequestDTO = {
        title: 'New Task',
        description: 'New task description',
        status: 'IN_PROGRESS' as any,
        priority: 'HIGH' as any,
        dueDate: '2026-06-15',
        assigneeId: 'user1',
      }

      await service.create({ data: createTaskDto, projectId: 'project1' })

      // lê o primeiro item da coluna alvo
      expect(prismaService.task.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'project1', status: 'IN_PROGRESS' },
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
          order: generateKeyBetween(null, null), // 'a0'
          dueDate: new Date('2026-06-15T00:00:00.000Z'),
          projectId: 'project1',
        },
        include: taskInclude,
      })
    })

    it('should default to TODO, ignore position and insert before the current first', async () => {
      prismaMock.task.findFirst.mockResolvedValue({ order: 'a0' })

      const createTaskDto: TasksRequestDTO = {
        title: 'No Due Date Task',
        description: 'desc',
        priority: 'LOW' as any,
        assigneeId: 'user1',
        position: 5,
      }

      await service.create({ data: createTaskDto, projectId: 'project1' })

      expect(prismaService.task.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'project1', status: 'TODO' },
        orderBy: { order: 'asc' },
        select: { order: true },
      })
      expect(prismaService.task.create).toHaveBeenCalledWith({
        data: {
          title: 'No Due Date Task',
          description: 'desc',
          priority: 'LOW',
          assigneeId: 'user1',
          status: 'TODO',
          order: generateKeyBetween(null, 'a0'), // antes de 'a0'
          dueDate: undefined,
          projectId: 'project1',
        },
        include: taskInclude,
      })
    })
  })

  describe('findAllByProjectId', () => {
    it('should return tasks ordered by status then order key', async () => {
      prismaMock.task.count.mockResolvedValue(1)
      prismaMock.task.findMany.mockResolvedValue([mockTask])

      const query: QueryPaginationDTO = { page: '1', limit: '10' }
      const result = await service.findAllByProjectId({ projectId: 'project1', query })

      expect(prismaService.task.findMany).toHaveBeenCalledWith({
        where: { projectId: 'project1' },
        skip: 0,
        take: 10,
        orderBy: [{ status: 'asc' }, { order: 'asc' }],
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          order: true,
          dueDate: true,
          assignee: { select: { id: true, name: true, email: true, avatar: true } },
          ...tagsSelect,
          createdAt: true,
          updatedAt: true,
        },
      })
      expect(result.data).toEqual([mockTask])
      expect(result.meta.total).toEqual(1)
    })
  })

  describe('update', () => {
    it('should do a plain update when neither status nor position changes', async () => {
      prismaMock.task.findFirst.mockResolvedValue({ status: 'TODO' })

      const updateTaskDto: TasksRequestDTO = {
        title: 'Updated Task',
        description: 'Updated description',
        priority: 'HIGH' as any,
        dueDate: '2026-07-01',
        assigneeId: 'user2',
      }

      await service.update({ id: 'task1', data: updateTaskDto, projectId: 'project1' })

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

    it('should move to the top of the destination column on a status change', async () => {
      prismaMock.task.findFirst.mockResolvedValue({ status: 'TODO' })
      prismaMock.task.findMany.mockResolvedValue([{ order: 'a0' }]) // destino tem 1 item

      const updateTaskDto: TasksRequestDTO = {
        title: 'Moved',
        status: 'DONE' as any,
        priority: 'LOW' as any,
        assigneeId: 'user1',
      }

      await service.update({ id: 'task1', data: updateTaskDto, projectId: 'project1' })

      expect(prismaService.task.findMany).toHaveBeenCalledWith({
        where: { projectId: 'project1', status: 'DONE', id: { not: 'task1' } },
        orderBy: { order: 'asc' },
        select: { order: true },
      })
      expect(prismaService.task.update).toHaveBeenCalledWith({
        where: { id: 'task1', projectId: 'project1' },
        data: {
          title: 'Moved',
          status: 'DONE',
          priority: 'LOW',
          assigneeId: 'user1',
          dueDate: undefined,
          order: generateKeyBetween(null, 'a0'), // topo, antes do 'a0'
        },
        include: taskInclude,
      })
    })

    it('should compute a key between neighbors for a reorder within the column', async () => {
      prismaMock.task.findFirst.mockResolvedValue({ status: 'TODO' })
      prismaMock.task.findMany.mockResolvedValue([{ order: 'a0' }, { order: 'a1' }])

      const updateTaskDto: TasksRequestDTO = { title: 'Reorder', position: 1, assigneeId: 'user1' }

      await service.update({ id: 'task1', data: updateTaskDto, projectId: 'project1' })

      expect(prismaService.task.update).toHaveBeenCalledWith({
        where: { id: 'task1', projectId: 'project1' },
        data: {
          title: 'Reorder',
          assigneeId: 'user1',
          dueDate: undefined,
          status: 'TODO',
          order: generateKeyBetween('a0', 'a1'), // entre os vizinhos
        },
        include: taskInclude,
      })
    })

    it('should clamp position to the end of the column', async () => {
      prismaMock.task.findFirst.mockResolvedValue({ status: 'TODO' })
      prismaMock.task.findMany.mockResolvedValue([{ order: 'a0' }, { order: 'a1' }])

      const updateTaskDto: TasksRequestDTO = { title: 'ToEnd', position: 99, assigneeId: 'user1' }

      await service.update({ id: 'task1', data: updateTaskDto, projectId: 'project1' })

      expect(prismaService.task.update).toHaveBeenCalledWith({
        where: { id: 'task1', projectId: 'project1' },
        data: {
          title: 'ToEnd',
          assigneeId: 'user1',
          dueDate: undefined,
          status: 'TODO',
          order: generateKeyBetween('a1', null), // depois do último
        },
        include: taskInclude,
      })
    })
  })

  describe('delete', () => {
    it('should delete a task', async () => {
      await service.delete({ id: 'task1', projectId: 'project1' })
      expect(prismaService.task.delete).toHaveBeenCalledWith({
        where: { id: 'task1', projectId: 'project1' },
      })
    })
  })
})
