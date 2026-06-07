import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import request from 'supertest'
import { TagsController } from './tags.controller'
import { TagsService } from './tags.service'

describe('TagsController (integration)', () => {
  let app: INestApplication
  let service: TagsService

  const validTagId = '00000000-0000-0000-0000-000000000010'
  const mockTag = { id: validTagId, name: 'backend', color: 'emerald' }

  beforeEach(async () => {
    const serviceMock = {
      findAll: jest.fn().mockResolvedValue([mockTag]),
      create: jest.fn().mockResolvedValue(mockTag),
      delete: jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TagsController],
      providers: [{ provide: TagsService, useValue: serviceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .compile()

    app = module.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI })
    app.useGlobalPipes(new ValidationPipe({ transform: true }))
    await app.init()

    service = module.get<TagsService>(TagsService)
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /v1/tags', () => {
    it('returns all tags', async () => {
      const res = await request(app.getHttpServer()).get('/v1/tags').expect(200)

      expect(res.body).toEqual([mockTag])
      expect(service.findAll).toHaveBeenCalledTimes(1)
    })
  })

  describe('POST /v1/tags', () => {
    it('creates a tag', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/tags')
        .send({ name: 'backend', color: 'emerald' })
        .expect(201)

      expect(res.body).toEqual(mockTag)
      expect(service.create).toHaveBeenCalledWith({ name: 'backend', color: 'emerald' })
    })

    it('rejects an empty name', async () => {
      await request(app.getHttpServer()).post('/v1/tags').send({ name: '' }).expect(400)
    })

    it('rejects an invalid color token', async () => {
      await request(app.getHttpServer())
        .post('/v1/tags')
        .send({ name: 'x', color: 'not-a-color' })
        .expect(400)
    })
  })

  describe('DELETE /v1/tags/:tagId', () => {
    it('deletes a tag', async () => {
      await request(app.getHttpServer()).delete(`/v1/tags/${validTagId}`).expect(204)

      expect(service.delete).toHaveBeenCalledWith(validTagId)
    })

    it('rejects a non-uuid id', async () => {
      await request(app.getHttpServer()).delete('/v1/tags/not-a-uuid').expect(400)
    })
  })
})
