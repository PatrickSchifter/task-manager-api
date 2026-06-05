import { Test, TestingModule } from '@nestjs/testing'
import { CollaboratorsService } from './collaborators.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { paginateOutput } from 'src/utils/pagination.utils'
import { mockedCollaborators, mockPaginationQuery } from './collaborators.mocks'
import { CollaboratorRole } from 'src/generated/prisma/enums'
import { NotFoundException, BadRequestException } from '@nestjs/common'

describe('CollaboratorsService', () => {
  let service: CollaboratorsService
  let prisma: PrismaService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollaboratorsService,
        {
          provide: PrismaService,
          useValue: {
            projectCollaborator: {
              findMany: jest.fn(),
              count: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile()

    service = module.get<CollaboratorsService>(CollaboratorsService)
    prisma = module.get<PrismaService>(PrismaService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('should be able to return paginated list of collaborators', async () => {
    jest.spyOn(prisma.projectCollaborator, 'findMany').mockResolvedValue(mockedCollaborators)
    jest.spyOn(prisma.projectCollaborator, 'count').mockResolvedValue(mockedCollaborators.length)

    const result = await service.findAllByProject({
      projectId: 'project-1',
      query: mockPaginationQuery,
    })

    expect(result).toEqual(
      paginateOutput({
        data: mockedCollaborators,
        total: mockedCollaborators.length,
        query: mockPaginationQuery,
      }),
    )

    expect(prisma.projectCollaborator.findMany).toHaveBeenCalledTimes(1)
  })

  it('should be able to create a collaborator', async () => {
    const collaborator = mockedCollaborators[0]
    const addData = { email: 'test@test.com', role: CollaboratorRole.EDITOR }

    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'user-1', name: 'Test User', email: 'test@test.com' } as any)
    jest.spyOn(prisma.projectCollaborator, 'create').mockResolvedValue(collaborator)

    const result = await service.create({ projectId: 'project-1', data: addData })

    expect(result).toEqual(collaborator)
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1)
    expect(prisma.projectCollaborator.create).toHaveBeenCalledTimes(1)
  })

  it('should throw NotFoundException when creating collaborator with non-existent user', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null)

    await expect(
      service.create({ projectId: 'project-1', data: { email: 'non-existent@test.com', role: CollaboratorRole.EDITOR } }),
    ).rejects.toThrow(NotFoundException)
  })

  it('should be able to update a collaborator', async () => {
    const collaborator = mockedCollaborators[0]
    const updateData = { role: CollaboratorRole.VIEWER }

    jest.spyOn(prisma.projectCollaborator, 'findUnique').mockResolvedValue(collaborator)
    jest.spyOn(prisma.projectCollaborator, 'update').mockResolvedValue({ ...collaborator, ...updateData })

    const result = await service.update({
      projectId: 'project-1',
      userId: 'user-1',
      data: updateData,
    })

    expect(result.role).toEqual(CollaboratorRole.VIEWER)
    expect(prisma.projectCollaborator.update).toHaveBeenCalledTimes(1)
  })

  it('should throw NotFoundException when updating non-existent collaborator', async () => {
    jest.spyOn(prisma.projectCollaborator, 'findUnique').mockResolvedValue(null)

    await expect(
      service.update({
        projectId: 'project-1',
        userId: 'user-1',
        data: { role: CollaboratorRole.VIEWER },
      }),
    ).rejects.toThrow(NotFoundException)
  })

  it('should be able to delete a collaborator', async () => {
    const collaborator = { ...mockedCollaborators[0], role: CollaboratorRole.EDITOR }

    jest.spyOn(prisma.projectCollaborator, 'findUnique').mockResolvedValue(collaborator)
    jest.spyOn(prisma.projectCollaborator, 'delete').mockResolvedValue(collaborator)

    const result = await service.delete({ userId: 'user-1', projectId: 'project-1' })

    expect(result).toEqual(collaborator)
    expect(prisma.projectCollaborator.delete).toHaveBeenCalledTimes(1)
  })

  it('should throw NotFoundException when deleting non-existent collaborator', async () => {
    jest.spyOn(prisma.projectCollaborator, 'findUnique').mockResolvedValue(null)

    await expect(service.delete({ userId: 'user-1', projectId: 'project-1' })).rejects.toThrow(NotFoundException)
  })

  it('should throw BadRequestException when deleting owner collaborator', async () => {
    const ownerCollaborator = { ...mockedCollaborators[0], role: CollaboratorRole.OWNER }

    jest.spyOn(prisma.projectCollaborator, 'findUnique').mockResolvedValue(ownerCollaborator)

    await expect(service.delete({ userId: 'user-1', projectId: 'project-1' })).rejects.toThrow(BadRequestException)
  })
})