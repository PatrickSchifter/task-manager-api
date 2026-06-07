import { Test, TestingModule } from '@nestjs/testing'
import { Project } from 'src/generated/prisma/client'
import { PrismaService } from 'src/prisma/prisma.service'
import { paginateOutput } from 'src/utils/pagination.utils'
import { AttachmentsService } from '../attachments/attachments.service'
import { RagService } from '../rag/rag.service'
import { ProjectDTO } from './projects.dto'
import { mockedProjects, mockPaginationQuery } from './projects.mocks'
import { ProjectsService } from './projects.service'

describe('ProjectsService', () => {
  let service: ProjectsService
  let prisma: PrismaService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: PrismaService,
          useValue: {
            project: {
              findMany: jest.fn(),
              count: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            projectCollaborator: {
              create: jest.fn(),
              deleteMany: jest.fn(),
            },
            projectStatus: {
              createMany: jest.fn(),
            },
            comment: {
              deleteMany: jest.fn(),
            },
            task: {
              deleteMany: jest.fn(),
            },
          },
        },
        {
          provide: RagService,
          useValue: {
            dispatchProjectEmbedding: jest.fn(),
            dispatchProjectDelete: jest.fn(),
          },
        },
        {
          provide: AttachmentsService,
          useValue: { cleanupForTasks: jest.fn(), cleanupForProject: jest.fn() },
        },
      ],
    }).compile()

    service = module.get<ProjectsService>(ProjectsService)
    prisma = module.get<PrismaService>(PrismaService)
  })

  it('should be able to return paginated list of projects', async () => {
    // findAll enriquece cada projeto com role + membersCount a partir do
    // _count e dos collaborators retornados pelo prisma.
    const prismaProjects = mockedProjects.map(({ role, membersCount, ...project }) => ({
      ...project,
      _count: { collaborators: membersCount },
      collaborators: [{ role }],
    }))

    // criando o mock e especificando o retorno das funções
    jest.spyOn(prisma.project, 'findMany').mockResolvedValue(prismaProjects as never)
    jest.spyOn(prisma.project, 'count').mockResolvedValue(mockedProjects.length)

    //chamada da função
    const result = await service.findAll('user-1', mockPaginationQuery)

    //comparações
    expect(result).toEqual(
      paginateOutput({
        data: mockedProjects,
        total: mockedProjects.length,
        query: mockPaginationQuery,
      }),
    )

    expect(prisma.project.findMany).toHaveBeenCalledTimes(1)
  })

  it('should return a project by id with flattened tags and subtask progress', async () => {
    const base = mockedProjects[0]
    const dbProject = {
      ...base,
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          tags: [{ tag: { id: 'tag-1', name: 'backend', color: 'emerald' } }],
          subtasks: [{ status: 'DONE' }, { status: 'TODO' }],
        },
      ],
    }
    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue(dbProject as never)

    const result = await service.findById('user-1', base.id)

    expect(result).toEqual({
      ...base,
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          tags: [{ id: 'tag-1', name: 'backend', color: 'emerald' }],
          subtaskProgress: { done: 1, total: 2 },
        },
      ],
    })
    expect(prisma.project.findFirst).toHaveBeenCalledTimes(1)
  })

  it('only requests top-level tasks for the board (parentId IS NULL)', async () => {
    const base = mockedProjects[0]
    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue({ ...base, tasks: [] } as never)

    await service.findById('user-1', base.id)

    const arg = (prisma.project.findFirst as jest.Mock).mock.calls[0][0]
    expect(arg.select.tasks.where).toEqual({ parentId: null })
    expect(arg.select.tasks.select.subtasks).toEqual({ select: { status: true } })
  })

  it('should be able to create a project', async () => {
    const project = mockedProjects[0]
    jest.spyOn(prisma.project, 'create').mockResolvedValue(project)

    const result = await service.create('user-1', {
      description: project.description,
      name: project.name,
    })

    expect(result).toEqual(project)
    expect(prisma.project.create).toHaveBeenCalledTimes(1)
    expect(prisma.projectCollaborator.create).toHaveBeenCalledTimes(1)
  })

  it('should create a project without description', async () => {
    const project = { ...mockedProjects[0], description: null }
    jest.spyOn(prisma.project, 'create').mockResolvedValue(project)

    const result = await service.create('user-1', {
      name: project.name,
    } as ProjectDTO)

    expect(result).toEqual(project)
    expect(prisma.projectCollaborator.create).toHaveBeenCalledTimes(1)
  })

  it('should be able to update a project', async () => {
    const project = mockedProjects[0]

    jest.spyOn(prisma.project, 'update').mockResolvedValue(project)

    const result = await service.update('user-1', project.id, {
      description: project.description,
      name: project.name,
    })

    expect(result).toEqual(project)
    expect(prisma.project.update).toHaveBeenCalledTimes(1)
  })

  it('should update a project without description', async () => {
    const project = { ...mockedProjects[0], description: null }
    jest.spyOn(prisma.project, 'update').mockResolvedValue(project)

    const result = await service.update('user-1', project.id, {
      name: project.name,
    } as ProjectDTO)

    expect(result).toEqual(project)
    expect(prisma.project.update).toHaveBeenCalledTimes(1)
  })

  it('should be able to delete a project', async () => {
    const project = { ...mockedProjects[0] }

    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue(project)

    await service.delete('user-1', project.id)

    expect(prisma.task.deleteMany).toHaveBeenCalledTimes(1)
    expect(prisma.project.delete).toHaveBeenCalledTimes(1)
  })

  it('should not delete collaborators or tasks if project not found', async () => {
    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue(null)
    jest.spyOn(prisma.project, 'delete').mockResolvedValue(null as unknown as Project)

    await service.delete('user-1', 'nonexistent')

    expect(prisma.projectCollaborator.deleteMany).not.toHaveBeenCalled()
    expect(prisma.task.deleteMany).not.toHaveBeenCalled()
    expect(prisma.comment.deleteMany).not.toHaveBeenCalled()
    expect(prisma.project.delete).toHaveBeenCalledTimes(1)
  })

  it('should not delete collaborators or tasks if user is not the owner', async () => {
    const project = { ...mockedProjects[0], createdById: 'other-user' }
    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue(project)
    jest.spyOn(prisma.project, 'delete').mockResolvedValue(null as unknown as Project)

    await service.delete('user-1', project.id)

    expect(prisma.projectCollaborator.deleteMany).not.toHaveBeenCalled()
    expect(prisma.task.deleteMany).not.toHaveBeenCalled()
    expect(prisma.comment.deleteMany).not.toHaveBeenCalled()
    expect(prisma.project.delete).toHaveBeenCalledTimes(1)
  })
})
