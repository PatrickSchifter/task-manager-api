import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { CollaboratorsController } from './collaborators.controller'
import { CollaboratorsService } from './collaborators.service'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { ValidateResourcesIdsInterceptor } from 'src/common/interceptors/validate-resources-ids.interceptor'
import { Reflector } from '@nestjs/core'
import { PrismaService } from 'src/prisma/prisma.service'

describe('CollaboratorsController (integration)', () => {
  let app: INestApplication
  let service: CollaboratorsService

  const mockCollaborator = {
    id: 'collab1',
    projectId: 'project-1',
    userId: 'user-1',
    role: 'EDITOR',
    createdAt: new Date(),
    user: { id: 'user-1', name: 'Test', email: 'test@test.com', avatar: null },
  }

  beforeEach(async () => {
    const serviceMock = {
      findAllByProject: jest.fn().mockResolvedValue({
        data: [mockCollaborator],
        meta: { total: 1, currentPage: 1, lastPage: 1, nextPage: null, prevPage: null, totalPerPage: 10 },
      }),
      create: jest.fn().mockResolvedValue(mockCollaborator),
      update: jest.fn().mockResolvedValue(mockCollaborator),
      delete: jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CollaboratorsController],
      providers: [
        { provide: CollaboratorsService, useValue: serviceMock },
        { provide: Reflector, useValue: { get: jest.fn().mockReturnValue(false) } },
        {
          provide: PrismaService,
          useValue: {
            project: { findFirst: jest.fn().mockResolvedValue({ id: '00000000-0000-0000-0000-000000000001' }) },
            task: { findFirst: jest.fn() },
            user: { findFirst: jest.fn() },
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

    service = module.get<CollaboratorsService>(CollaboratorsService)
  })

  afterEach(async () => {
    await app.close()
  })

  const validProjectId = '00000000-0000-0000-0000-000000000001'
  const validUserId = '00000000-0000-0000-0000-000000000002'

  describe('GET /projects/:projectId/collaborators', () => {
    it('should return paginated collaborators', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${validProjectId}/collaborators`)
        .expect(200)

      expect(res.body.data).toHaveLength(1)
      expect(service.findAllByProject).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: validProjectId }),
      )
    })
  })

  describe('POST /projects/:projectId/collaborators', () => {
    it('should create a collaborator', async () => {
      const res = await request(app.getHttpServer())
        .post(`/projects/${validProjectId}/collaborators`)
        .send({ userId: validUserId, role: 'VIEWER' })
        .expect(201)

      expect(service.create).toHaveBeenCalledWith({
        projectId: validProjectId,
        data: { userId: validUserId, role: 'VIEWER' },
      })
    })
  })

  describe('PUT /projects/:projectId/collaborators/:userId', () => {
    it('should update a collaborator', async () => {
      const res = await request(app.getHttpServer())
        .put(`/projects/${validProjectId}/collaborators/${validUserId}`)
        .send({ role: 'VIEWER' })
        .expect(200)

      expect(service.update).toHaveBeenCalledWith({
        projectId: validProjectId,
        userId: validUserId,
        data: { role: 'VIEWER' },
      })
    })
  })

  describe('DELETE /projects/:projectId/collaborators/:userId', () => {
    it('should delete a collaborator', async () => {
      await request(app.getHttpServer())
        .delete(`/projects/${validProjectId}/collaborators/${validUserId}`)
        .expect(204)

      expect(service.delete).toHaveBeenCalledWith({
        projectId: validProjectId,
        userId: validUserId,
      })
    })
  })
})
