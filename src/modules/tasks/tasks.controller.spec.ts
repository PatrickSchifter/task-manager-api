import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { ValidateResourcesIdsInterceptor } from 'src/common/interceptors/validate-resources-ids.interceptor'
import { Reflector } from '@nestjs/core'
import { PrismaService } from 'src/prisma/prisma.service'

describe('TasksController (integration)', () => {
  let app: INestApplication
  let service: TasksService

  const validProjectId = '00000000-0000-0000-0000-000000000001'
  const validTaskId = '00000000-0000-0000-0000-000000000002'

  const mockTask = {
    id: validTaskId,
    title: 'Test Task',
    description: 'Description',
    status: 'TODO',
    priority: 'MEDIUM',
    dueDate: new Date().toISOString(),
    projectId: validProjectId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assignee: { id: 'user1', name: 'User', email: 'user@test.com', avatar: null },
  }

  beforeEach(async () => {
    const serviceMock = {
      create: jest.fn().mockResolvedValue(mockTask),
      findAllByProjectId: jest.fn().mockResolvedValue({
        data: [mockTask],
        meta: {
          total: 1, currentPage: 1, lastPage: 1,
          nextPage: null, prevPage: null, totalPerPage: 10,
        },
      }),
      findById: jest.fn().mockResolvedValue(mockTask),
      update: jest.fn().mockResolvedValue(mockTask),
      delete: jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: serviceMock },
        { provide: Reflector, useValue: { get: jest.fn().mockReturnValue(false) } },
        {
          provide: PrismaService,
          useValue: {
            project: { findFirst: jest.fn().mockResolvedValue({ id: validProjectId }) },
            task: { findFirst: jest.fn().mockResolvedValue({ id: validTaskId }) },
            user: { findFirst: jest.fn().mockResolvedValue({ id: 'user1' }) },
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .overrideInterceptor(ValidateResourcesIdsInterceptor)
      .useValue({ intercept: jest.fn((ctx, next) => next.handle()) })
      .compile()

    app = module.createNestApplication()
    await app.init()

    service = module.get<TasksService>(TasksService)
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /projects/:projectId/tasks', () => {
    it('should return paginated tasks', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${validProjectId}/tasks`)
        .expect(200)

      expect(service.findAllByProjectId).toHaveBeenCalledWith({
        projectId: validProjectId,
        query: {},
      })
    })
  })

  describe('POST /projects/:projectId/tasks', () => {
    it('should create a task', async () => {
      const res = await request(app.getHttpServer())
        .post(`/projects/${validProjectId}/tasks`)
        .send({ title: 'New Task' })
        .expect(201)

      expect(service.create).toHaveBeenCalledWith({
        data: { title: 'New Task' },
        projectId: validProjectId,
      })
    })
  })

  describe('GET /projects/:projectId/tasks/:taskId', () => {
    it('should return a task by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${validProjectId}/tasks/${validTaskId}`)
        .expect(200)

      expect(service.findById).toHaveBeenCalledWith({
        id: validTaskId,
        projectId: validProjectId,
      })
    })
  })

  describe('PUT /projects/:projectId/tasks/:taskId', () => {
    it('should update a task', async () => {
      const res = await request(app.getHttpServer())
        .put(`/projects/${validProjectId}/tasks/${validTaskId}`)
        .send({ title: 'Updated' })
        .expect(200)

      expect(service.update).toHaveBeenCalledWith({
        data: { title: 'Updated' },
        id: validTaskId,
        projectId: validProjectId,
      })
    })
  })

  describe('DELETE /projects/:projectId/tasks/:taskId', () => {
    it('should delete a task', async () => {
      await request(app.getHttpServer())
        .delete(`/projects/${validProjectId}/tasks/${validTaskId}`)
        .expect(204)

      expect(service.delete).toHaveBeenCalledWith({
        id: validTaskId,
        projectId: validProjectId,
      })
    })
  })
})
