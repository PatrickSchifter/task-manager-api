import { INestApplication, VersioningType } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { ValidateResourcesIdsInterceptor } from 'src/common/interceptors/validate-resources-ids.interceptor'
import { PrismaService } from 'src/prisma/prisma.service'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'

describe('DashboardController (integration)', () => {
  let app: INestApplication
  let service: DashboardService

  const mockSummary = {
    stats: { activeTasks: 5, completedLast7Days: 2, inProgress: 3 },
    recentProjects: [{ id: 'p1', name: 'Project 1', totalTasks: 3, doneTasks: 2 }],
    upcomingTasks: [],
  }

  beforeEach(async () => {
    const serviceMock = {
      getSummary: jest.fn().mockResolvedValue(mockSummary),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: serviceMock },
        { provide: Reflector, useValue: { get: jest.fn().mockReturnValue(false) } },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .overrideInterceptor(ValidateResourcesIdsInterceptor)
      .useValue({ intercept: jest.fn((_ctx, next) => next.handle()) })
      .compile()

    app = module.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI })
    await app.init()

    service = module.get<DashboardService>(DashboardService)
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /v1/dashboard/summary', () => {
    it('returns the dashboard summary', async () => {
      const res = await request(app.getHttpServer()).get('/v1/dashboard/summary').expect(200)

      expect(res.body).toEqual(mockSummary)
      expect(service.getSummary).toHaveBeenCalledTimes(1)
    })
  })
})
