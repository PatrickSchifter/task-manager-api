import { Test, TestingModule } from '@nestjs/testing'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { ValidateResourcesIdsInterceptor } from 'src/common/interceptors/validate-resources-ids.interceptor'
import { CloudnaryService } from 'src/common/services/cloudnary/cloudnary.service'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

const mockUser = { id: 'uuid-123', name: 'John', email: 'john@test.com', avatar: null }

const mockUsersService = {
  findAll: jest.fn().mockResolvedValue({ data: [mockUser], total: 1 }),
  create: jest.fn().mockResolvedValue(mockUser),
  findById: jest.fn().mockResolvedValue(mockUser),
  update: jest.fn().mockResolvedValue(mockUser),
  delete: jest.fn().mockResolvedValue(undefined),
}

const mockCloudnaryService = {
  upload: jest.fn().mockResolvedValue({ url: 'https://cloudinary.com/avatar.jpg' }),
}

const mockRequestContext = {
  getUser: jest.fn().mockReturnValue(mockUser),
}

describe('UsersController', () => {
  let controller: UsersController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: CloudnaryService, useValue: mockCloudnaryService },
        { provide: RequestContextService, useValue: mockRequestContext },
      ],
    })
      // Sobrescreve os guards/interceptors para não precisar de JWT real
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(ValidateResourcesIdsInterceptor)
      .useValue({ intercept: (_: any, next: any) => next.handle() })
      .compile()

    controller = module.get<UsersController>(UsersController)
  })

  afterEach(() => jest.clearAllMocks())

  // --- findAll ---
  describe('findAll', () => {
    it('should return paginated users', async () => {
      const query = { page: 1, limit: 10 }
      const result = await controller.findAll(query)

      expect(mockUsersService.findAll).toHaveBeenCalledWith(query)
      expect(result).toEqual({ data: [mockUser], total: 1 })
    })

    it('should call findAll without query', async () => {
      await controller.findAll()
      expect(mockUsersService.findAll).toHaveBeenCalledWith(undefined)
    })
  })

  // --- create ---
  describe('create', () => {
    it('should create a user', async () => {
      const dto = { name: 'John', email: 'john@test.com', password: '123456' }
      const result = await controller.create(dto)

      expect(mockUsersService.create).toHaveBeenCalledWith(dto)
      expect(result).toEqual(mockUser)
    })
  })

  // --- findById ---
  describe('findById', () => {
    it('should return a user by id', async () => {
      const result = await controller.findById('uuid-123')

      expect(mockUsersService.findById).toHaveBeenCalledWith('uuid-123')
      expect(result).toEqual(mockUser)
    })

    it('should propagate error when user not found', async () => {
      mockUsersService.findById.mockRejectedValueOnce(new Error('Not found'))

      await expect(controller.findById('invalid-id')).rejects.toThrow('Not found')
    })
  })

  // --- update ---
  describe('update', () => {
    it('should update a user', async () => {
      const dto = { name: 'Updated' }
      const result = await controller.update('uuid-123', dto)

      expect(mockUsersService.update).toHaveBeenCalledWith({ data: dto, id: 'uuid-123' })
      expect(result).toEqual(mockUser)
    })
  })

  // --- delete ---
  describe('delete', () => {
    it('should delete a user', async () => {
      await controller.delete('uuid-123')
      expect(mockUsersService.delete).toHaveBeenCalledWith('uuid-123')
    })
  })

  // --- uploadAvatar ---
  describe('uploadAvatar', () => {
    const mockFile = {
      fieldname: 'file',
      originalname: 'avatar.png',
      mimetype: 'image/png',
      buffer: Buffer.from(''),
      size: 1000,
    } as Express.Multer.File

    it('should upload avatar and update user', async () => {
      const result = await controller.uploadAvatar(mockFile)

      expect(mockRequestContext.getUser).toHaveBeenCalled()
      expect(mockCloudnaryService.upload).toHaveBeenCalledWith({
        file: mockFile,
        folder: 'avatars',
        name: 'uuid-123',
      })
      expect(mockUsersService.update).toHaveBeenCalledWith({
        data: { avatar: 'https://cloudinary.com/avatar.jpg' },
        id: 'uuid-123',
      })
      expect(mockUsersService.findById).toHaveBeenCalledWith('uuid-123')
      expect(result).toEqual(mockUser)
    })

    it('should propagate error if cloudinary upload fails', async () => {
      mockCloudnaryService.upload.mockRejectedValueOnce(new Error('Upload failed'))

      await expect(controller.uploadAvatar(mockFile)).rejects.toThrow('Upload failed')
    })
  })
})
