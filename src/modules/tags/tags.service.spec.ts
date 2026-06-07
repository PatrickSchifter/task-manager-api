import { Test, TestingModule } from '@nestjs/testing'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { TagsService } from './tags.service'

describe('TagsService', () => {
  let service: TagsService
  let prisma: PrismaService

  const ownerId = 'user-1'

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        {
          provide: PrismaService,
          useValue: {
            tag: {
              findMany: jest.fn(),
              upsert: jest.fn(),
              deleteMany: jest.fn(),
            },
          },
        },
        {
          provide: RequestContextService,
          useValue: { getUserId: jest.fn().mockReturnValue(ownerId) },
        },
      ],
    }).compile()

    service = module.get<TagsService>(TagsService)
    prisma = module.get<PrismaService>(PrismaService)
  })

  describe('findAll', () => {
    it('returns the owner tags ordered by name', async () => {
      const tags = [{ id: 't1', name: 'backend', color: 'emerald' }]
      jest.spyOn(prisma.tag, 'findMany').mockResolvedValue(tags as never)

      const result = await service.findAll()

      expect(result).toEqual(tags)
      expect(prisma.tag.findMany).toHaveBeenCalledWith({
        where: { ownerId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, color: true },
      })
    })
  })

  describe('create', () => {
    it('upserts a tag using the explicit color when provided', async () => {
      const tag = { id: 't1', name: 'design', color: 'rose' }
      jest.spyOn(prisma.tag, 'upsert').mockResolvedValue(tag as never)

      const result = await service.create({ name: '  design  ', color: 'rose' })

      expect(result).toEqual(tag)
      expect(prisma.tag.upsert).toHaveBeenCalledWith({
        where: { ownerId_name: { ownerId, name: 'design' } },
        update: {},
        create: { ownerId, name: 'design', color: 'rose' },
        select: { id: true, name: true, color: true },
      })
    })

    it('auto-assigns a color when none is provided', async () => {
      const tag = { id: 't1', name: 'backend', color: 'emerald' }
      jest.spyOn(prisma.tag, 'upsert').mockResolvedValue(tag as never)

      await service.create({ name: 'backend' })

      expect(prisma.tag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { ownerId, name: 'backend', color: 'emerald' },
        }),
      )
    })
  })

  describe('delete', () => {
    it('scopes deletion to the owner via deleteMany', async () => {
      jest.spyOn(prisma.tag, 'deleteMany').mockResolvedValue({ count: 1 } as never)

      await service.delete('t1')

      expect(prisma.tag.deleteMany).toHaveBeenCalledWith({
        where: { id: 't1', ownerId },
      })
    })
  })

  describe('resolveNames', () => {
    it('dedupes names case-insensitively and returns one id per unique tag', async () => {
      jest.spyOn(prisma.tag, 'upsert').mockImplementation(
        (args: any) =>
          Promise.resolve({
            id: `id-${args.create.name.toLowerCase()}`,
            name: args.create.name,
            color: args.create.color,
          }) as never,
      )

      const ids = await service.resolveNames(ownerId, ['Backend', 'backend', ' BACKEND ', 'design'])

      expect(prisma.tag.upsert).toHaveBeenCalledTimes(2)
      expect(ids).toEqual(['id-backend', 'id-design'])
    })

    it('ignores empty and whitespace-only names', async () => {
      jest
        .spyOn(prisma.tag, 'upsert')
        .mockResolvedValue({ id: 'id-1', name: 'real', color: 'brand' } as never)

      const ids = await service.resolveNames(ownerId, ['', '   ', 'real'])

      expect(prisma.tag.upsert).toHaveBeenCalledTimes(1)
      expect(ids).toEqual(['id-1'])
    })

    it('returns an empty array when no valid names are given', async () => {
      const ids = await service.resolveNames(ownerId, ['', '  '])

      expect(prisma.tag.upsert).not.toHaveBeenCalled()
      expect(ids).toEqual([])
    })
  })
})
