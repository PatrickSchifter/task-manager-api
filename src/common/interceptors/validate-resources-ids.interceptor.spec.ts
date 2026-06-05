import { ExecutionContext, NotFoundException } from '@nestjs/common'
import { HttpArgumentsHost } from '@nestjs/common/interfaces'
import { Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import { of } from 'rxjs'
import { VALIDATE_RESOURCES_IDS } from 'src/consts'
import { mockedProjects } from 'src/modules/projects/projects.mocks'
import { PrismaService } from 'src/prisma/prisma.service'
import { ValidateResourcesIdsInterceptor } from './validate-resources-ids.interceptor'

describe('ValidateResourcesIdsInterceptor', () => {
  let interceptor: ValidateResourcesIdsInterceptor
  let reflector: Reflector
  let prisma: PrismaService

  const mockExecutionContext = {
    switchToHttp: jest.fn().mockReturnThis(),
    getRequest: jest.fn(),
    getHandler: jest.fn(),
  } as unknown as ExecutionContext

  const mockCallHandler = {
    handle: jest.fn(() => of({})),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidateResourcesIdsInterceptor,
        { provide: Reflector, useValue: { get: jest.fn() } },
        {
          provide: PrismaService,
          useValue: {
            project: { findFirst: jest.fn() },
            task: { findFirst: jest.fn() },
          },
        },
      ],
    }).compile()

    interceptor = module.get<ValidateResourcesIdsInterceptor>(ValidateResourcesIdsInterceptor)
    reflector = module.get<Reflector>(Reflector)
    prisma = module.get<PrismaService>(PrismaService)
  })

  it('should skip validation if decorator is not present', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue(false)

    const result = await interceptor.intercept(mockExecutionContext, mockCallHandler)

    expect(reflector.get).toHaveBeenCalledWith(
      VALIDATE_RESOURCES_IDS,
      mockExecutionContext.getHandler(),
    )
    expect(result).toBeDefined()
    expect(prisma.project.findFirst).not.toHaveBeenCalled()
  })

  // Busca esperada: o projeto só é "encontrado" se o usuário for dono ou
  // colaborador — é isso que transforma a checagem de existência em checagem de
  // acesso e fecha o IDOR.
  const accessWhere = (projectId: string, requesterId: string) => ({
    where: {
      id: projectId,
      OR: [{ createdById: requesterId }, { collaborators: { some: { userId: requesterId } } }],
    },
  })

  it('should throw if the user is neither owner nor collaborator (no access)', async () => {
    const mockRequest = {
      params: { projectId: 'project-1' },
      user: { id: 'intruder' },
    }

    jest.spyOn(reflector, 'get').mockReturnValue(true)
    jest
      .spyOn(mockExecutionContext, 'switchToHttp')
      .mockReturnValue({ getRequest: () => mockRequest } as HttpArgumentsHost)

    // Escopada por acesso, a query não retorna nada para um usuário sem vínculo.
    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue(null)

    await expect(interceptor.intercept(mockExecutionContext, mockCallHandler)).rejects.toThrow(
      NotFoundException,
    )
    expect(prisma.project.findFirst).toHaveBeenCalledWith(accessWhere('project-1', 'intruder'))
  })

  it('should allow the owner and continue', async () => {
    const mockRequest = {
      params: { projectId: 'project-1' },
      user: { id: 'owner-1' },
    }

    jest.spyOn(reflector, 'get').mockReturnValue(true)
    jest
      .spyOn(mockExecutionContext, 'switchToHttp')
      .mockReturnValue({ getRequest: () => mockRequest } as HttpArgumentsHost)

    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue(mockedProjects[0])
    const result = await interceptor.intercept(mockExecutionContext, mockCallHandler)

    expect(result).toBeDefined()
    expect(prisma.project.findFirst).toHaveBeenCalledWith(accessWhere('project-1', 'owner-1'))
  })

  it('should allow a collaborator and continue', async () => {
    const mockRequest = {
      params: { projectId: 'project-1' },
      user: { id: 'collab-1' },
    }

    jest.spyOn(reflector, 'get').mockReturnValue(true)
    jest
      .spyOn(mockExecutionContext, 'switchToHttp')
      .mockReturnValue({ getRequest: () => mockRequest } as HttpArgumentsHost)

    // A query escopada por acesso já encontra o projeto via colaboração.
    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue(mockedProjects[0])
    const result = await interceptor.intercept(mockExecutionContext, mockCallHandler)

    expect(result).toBeDefined()
    expect(prisma.project.findFirst).toHaveBeenCalledWith(accessWhere('project-1', 'collab-1'))
  })

  it('should validate task id and throw if task not found', async () => {
    const mockRequest = {
      params: { projectId: 'project-1', taskId: 'task-1' },
      user: { id: 'owner-1' },
    }

    jest.spyOn(reflector, 'get').mockReturnValue(true)
    jest
      .spyOn(mockExecutionContext, 'switchToHttp')
      .mockReturnValue({ getRequest: () => mockRequest } as HttpArgumentsHost)
    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue(mockedProjects[0])
    jest.spyOn(prisma.task, 'findFirst').mockResolvedValue(null)

    await expect(interceptor.intercept(mockExecutionContext, mockCallHandler)).rejects.toThrow(
      NotFoundException,
    )
    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: 'task-1', projectId: 'project-1' },
    })
  })

  it('should validate project and task and continue if both exists', async () => {
    const mockRequest = {
      params: { projectId: 'project-1', taskId: 'task-1' },
      user: { id: 'owner-1' },
    }
    jest.spyOn(reflector, 'get').mockReturnValue(true)
    jest
      .spyOn(mockExecutionContext, 'switchToHttp')
      .mockReturnValue({ getRequest: () => mockRequest } as HttpArgumentsHost)

    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue(mockedProjects[0])
    jest.spyOn(prisma.task, 'findFirst').mockResolvedValue({ id: 'task-1' } as any)

    const result = await interceptor.intercept(mockExecutionContext, mockCallHandler)

    expect(result).toBeDefined()
    expect(prisma.project.findFirst).toHaveBeenCalledWith(accessWhere('project-1', 'owner-1'))
    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: 'task-1', projectId: 'project-1' },
    })
  })
})
