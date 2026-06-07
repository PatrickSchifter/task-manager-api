import { Test, TestingModule } from '@nestjs/testing'
import { ValidateResourcesIdsInterceptor } from 'src/common/interceptors/validate-resources-ids.interceptor'
import { paginateOutput } from 'src/utils/pagination.utils'
import { ProjectsController } from './projects.controller'
import { mockedProjects, mockPaginationQuery } from './projects.mocks'

import { ProjectsService } from './projects.service'

describe('ProjectsController', () => {
  let controller: ProjectsController
  let service: ProjectsService

  // O controller deriva o ator do JWT via @AuthenticatedUser; nos testes
  // unitários passamos o user diretamente.
  const mockUser = { id: 'user-1' } as any

  beforeEach(async () => {
    const serviceMock = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        {
          provide: ProjectsService,
          useValue: serviceMock,
        },
      ],
    })
      .overrideInterceptor(ValidateResourcesIdsInterceptor)
      .useValue({
        intercept: jest.fn((_context, next) => next.handle()),
      })
      .compile()

    controller = module.get<ProjectsController>(ProjectsController)
    service = module.get<ProjectsService>(ProjectsService)
  })

  describe('findAll', () => {
    it('should return a paginated ist of projects', async () => {
      const mockedResponse = paginateOutput({
        data: mockedProjects,
        total: mockedProjects.length,
        query: mockPaginationQuery,
      })

      jest.spyOn(service, 'findAll').mockResolvedValue(mockedResponse)
      const response = await controller.findAll(mockUser, mockPaginationQuery)

      expect(response).toEqual(mockedResponse)
      expect(service.findAll).toHaveBeenCalledTimes(1)
    })
  })

  describe('findOne', () => {
    it('should be able to return a single project by id', async () => {
      const project = { ...mockedProjects[0], tasks: [], collaborators: [], statuses: [] }
      const { id } = project

      jest.spyOn(service, 'findById').mockResolvedValue(project)

      const response = await controller.findById(mockUser, id)

      expect(response).toEqual(project)
      expect(service.findById).toHaveBeenCalledWith(mockUser.id, id)
      expect(service.findById).toHaveBeenCalledTimes(1)
    })
  })

  describe('create', () => {
    it('should be able to create a project', async () => {
      const project = mockedProjects[0]

      jest.spyOn(service, 'create').mockResolvedValue(project)

      const response = await controller.create(mockUser, project)

      expect(response).toEqual(project)
      expect(service.create).toHaveBeenCalledTimes(1)
    })

    it('should be able to handle validation errors', async () => {
      const error = new Error('Name is required')

      jest.spyOn(service, 'create').mockRejectedValue(error)

      await expect(controller.create(mockUser, { name: '', description: '' })).rejects.toThrow(
        'Name is required',
      )
    })
  })

  describe('update', () => {
    it('should be able to update a project', async () => {
      const project = { ...mockedProjects[0], tasks: [] }

      jest.spyOn(service, 'update').mockResolvedValue(project)

      const response = await controller.update(mockUser, project.id, {
        name: project.name,
        description: project.description as string,
      })

      expect(response).toEqual(project)
      expect(service.update).toHaveBeenCalledTimes(1)
    })
  })

  describe('delete', () => {
    it('should be able to delete a project', async () => {
      jest.spyOn(service, 'delete').mockImplementation()
      await controller.delete(mockUser, mockedProjects[0].id)

      expect(service.delete).toHaveBeenCalledTimes(1)
    })
  })
})
