import { Test, TestingModule } from '@nestjs/testing'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { TaskPriority, TaskStatus } from 'src/generated/prisma/enums'
import { PrismaService } from 'src/prisma/prisma.service'
import { DashboardService } from './dashboard.service'

describe('DashboardService', () => {
  let service: DashboardService
  let prisma: PrismaService

  const userId = 'user-1'

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: PrismaService,
          useValue: {
            task: {
              count: jest.fn(),
              findMany: jest.fn(),
            },
            project: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: RequestContextService,
          useValue: { getUserId: jest.fn().mockReturnValue(userId) },
        },
      ],
    }).compile()

    service = module.get<DashboardService>(DashboardService)
    prisma = module.get<PrismaService>(PrismaService)
  })

  it('aggregates stats, recent projects and upcoming tasks', async () => {
    // count é chamado 3x (active, completedLast7Days, inProgress) nessa ordem.
    jest
      .spyOn(prisma.task, 'count')
      .mockResolvedValueOnce(5) // activeTasks
      .mockResolvedValueOnce(2) // completedLast7Days
      .mockResolvedValueOnce(3) // inProgress

    jest.spyOn(prisma.project, 'findMany').mockResolvedValue([
      {
        id: 'p1',
        name: 'Project 1',
        tasks: [
          { status: TaskStatus.DONE },
          { status: TaskStatus.TODO },
          { status: TaskStatus.DONE },
        ],
      },
    ] as never)

    const dueDate = new Date('2026-07-01T00:00:00.000Z')
    jest.spyOn(prisma.task, 'findMany').mockResolvedValue([
      {
        id: 't1',
        title: 'Task 1',
        dueDate,
        priority: TaskPriority.HIGH,
        status: TaskStatus.TODO,
        project: { name: 'Project 1', id: 'p1' },
      },
    ] as never)

    const result = await service.getSummary()

    expect(result.stats).toEqual({
      activeTasks: 5,
      completedLast7Days: 2,
      inProgress: 3,
    })

    expect(result.recentProjects).toEqual([
      { id: 'p1', name: 'Project 1', totalTasks: 3, doneTasks: 2 },
    ])

    expect(result.upcomingTasks).toEqual([
      {
        id: 't1',
        title: 'Task 1',
        project: { name: 'Project 1', id: 'p1' },
        dueDate: dueDate.toISOString(),
        priority: TaskPriority.HIGH,
        status: TaskStatus.TODO,
      },
    ])
  })

  it('maps a null dueDate to null', async () => {
    jest.spyOn(prisma.task, 'count').mockResolvedValue(0)
    jest.spyOn(prisma.project, 'findMany').mockResolvedValue([] as never)
    jest.spyOn(prisma.task, 'findMany').mockResolvedValue([
      {
        id: 't2',
        title: 'No due date',
        dueDate: null,
        priority: TaskPriority.LOW,
        status: TaskStatus.IN_PROGRESS,
        project: { name: 'P', id: 'p2' },
      },
    ] as never)

    const result = await service.getSummary()

    expect(result.upcomingTasks[0].dueDate).toBeNull()
  })

  it('scopes all queries to projects owned by or shared with the user', async () => {
    jest.spyOn(prisma.task, 'count').mockResolvedValue(0)
    jest.spyOn(prisma.project, 'findMany').mockResolvedValue([] as never)
    jest.spyOn(prisma.task, 'findMany').mockResolvedValue([] as never)

    await service.getSummary()

    const expectedProjectWhere = {
      OR: [{ createdById: userId }, { collaborators: { some: { userId } } }],
    }

    expect(prisma.task.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ project: expectedProjectWhere }),
      }),
    )
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedProjectWhere, take: 5 }),
    )
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          project: expectedProjectWhere,
          status: { not: TaskStatus.DONE },
          dueDate: { not: null },
        }),
        take: 10,
      }),
    )
  })

  it('returns empty collections when the user has no data', async () => {
    jest.spyOn(prisma.task, 'count').mockResolvedValue(0)
    jest.spyOn(prisma.project, 'findMany').mockResolvedValue([] as never)
    jest.spyOn(prisma.task, 'findMany').mockResolvedValue([] as never)

    const result = await service.getSummary()

    expect(result.stats).toEqual({ activeTasks: 0, completedLast7Days: 0, inProgress: 0 })
    expect(result.recentProjects).toEqual([])
    expect(result.upcomingTasks).toEqual([])
  })
})
