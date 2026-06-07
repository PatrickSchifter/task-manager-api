jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}))

const mockConnect = jest.fn()
const mockDisconnect = jest.fn()

jest.mock('../generated/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(function () {
    this.$connect = mockConnect
    this.$disconnect = mockDisconnect
    return this
  }),
}))

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaService } from './prisma.service'

describe('PrismaService', () => {
  let service: PrismaService

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
    service = new PrismaService()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('should construct PrismaPg with connection string', () => {
    expect(PrismaPg).toHaveBeenCalledWith({
      connectionString: 'postgresql://test:test@localhost:5432/test',
    })
  })

  describe('onModuleInit', () => {
    it('should connect to the database', async () => {
      await service.onModuleInit()
      expect(mockConnect).toHaveBeenCalled()
    })
  })

  describe('onModuleDestroy', () => {
    it('should disconnect from the database', async () => {
      await service.onModuleDestroy()
      expect(mockDisconnect).toHaveBeenCalled()
    })
  })
})
