import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { CommentsController } from './comments.controller'
import { CommentsService } from './comments.service'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { ValidateResourcesIdsInterceptor } from 'src/common/interceptors/validate-resources-ids.interceptor'
import { Reflector } from '@nestjs/core'
import { PrismaService } from 'src/prisma/prisma.service'

describe('CommentsController (integration)', () => {
  let app: INestApplication
  let service: CommentsService

  const validProjectId = '00000000-0000-0000-0000-000000000001'
  const validTaskId = '00000000-0000-0000-0000-000000000002'
  const validCommentId = '00000000-0000-0000-0000-000000000003'

  const mockComment = {
    id: validCommentId,
    content: 'Test Comment',
    taskId: validTaskId,
    authorId: 'user1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: { id: 'user1', name: 'User', email: 'user@test.com', avatar: null },
  }

  beforeEach(async () => {
    const serviceMock = {
      create: jest.fn().mockResolvedValue(mockComment),
      findByTaskId: jest.fn().mockResolvedValue({
        data: [mockComment],
        meta: {
          total: 1, currentPage: 1, lastPage: 1,
          nextPage: null, prevPage: null, totalPerPage: 10,
        },
      }),
      findById: jest.fn().mockResolvedValue(mockComment),
      update: jest.fn().mockResolvedValue(mockComment),
      delete: jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [
        { provide: CommentsService, useValue: serviceMock },
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
      .useValue({
        // Simula o JwtAuthGuard populando req.user, que o @AuthenticatedUser lê.
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = { id: 'user1' }
          return true
        },
      })
      .overrideInterceptor(ValidateResourcesIdsInterceptor)
      .useValue({ intercept: jest.fn((ctx, next) => next.handle()) })
      .compile()

    app = module.createNestApplication()
    await app.init()

    service = module.get<CommentsService>(CommentsService)
  })

  afterEach(async () => {
    await app.close()
  })

  describe('POST /projects/:projectId/tasks/:taskId/comments', () => {
    it('should create a comment', async () => {
      const res = await request(app.getHttpServer())
        .post(`/projects/${validProjectId}/tasks/${validTaskId}/comments`)
        .send({ content: 'New Comment' })
        .expect(201)

      expect(service.create).toHaveBeenCalledWith({
        actorId: 'user1',
        data: { content: 'New Comment' },
        taskId: validTaskId,
      })
    })
  })

  describe('GET /projects/:projectId/tasks/:taskId/comments', () => {
    it('should return paginated comments', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${validProjectId}/tasks/${validTaskId}/comments`)
        .expect(200)

      expect(service.findByTaskId).toHaveBeenCalledWith({
        taskId: validTaskId,
        query: {},
      })
    })
  })

  describe('GET /projects/:projectId/tasks/:taskId/comments/:commentId', () => {
    it('should return a comment by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${validProjectId}/tasks/${validTaskId}/comments/${validCommentId}`)
        .expect(200)

      expect(service.findById).toHaveBeenCalledWith(validCommentId)
    })
  })

  describe('PUT /projects/:projectId/tasks/:taskId/comments/:commentId', () => {
    it('should update a comment', async () => {
      const res = await request(app.getHttpServer())
        .put(`/projects/${validProjectId}/tasks/${validTaskId}/comments/${validCommentId}`)
        .send({ content: 'Updated' })
        .expect(200)

      expect(service.update).toHaveBeenCalledWith({
        actorId: 'user1',
        data: { content: 'Updated' },
        id: validCommentId,
      })
    })
  })

  describe('DELETE /projects/:projectId/tasks/:taskId/comments/:commentId', () => {
    it('should delete a comment', async () => {
      await request(app.getHttpServer())
        .delete(`/projects/${validProjectId}/tasks/${validTaskId}/comments/${validCommentId}`)
        .expect(204)

      expect(service.delete).toHaveBeenCalledWith({ actorId: 'user1', id: validCommentId })
    })
  })
})
