import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, Role } from 'src/generated/prisma/client';
import { QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto';

describe('UsersService', () => {
  let service: UsersService;
  let prismaService: PrismaService;

  const mockUser = {
    id: 'user1',
    name: 'Test User',
    email: 'test@example.com',
    password: 'hashedPassword',
    avatar: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUserWithoutPassword = (
    ({ password, ...rest }) => rest
  )(mockUser);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              create: jest.fn().mockResolvedValue(mockUserWithoutPassword),
              findFirst: jest.fn().mockResolvedValue(mockUser),
              findMany: jest.fn().mockResolvedValue([mockUserWithoutPassword]),
              count: jest.fn().mockResolvedValue(1),
              update: jest.fn().mockResolvedValue(mockUserWithoutPassword),
              delete: jest.fn().mockResolvedValue(mockUserWithoutPassword),
            },
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user and omit password', async () => {
      const createUserInput: Prisma.UserCreateInput = {
        name: 'New User',
        email: 'new@example.com',
        password: 'newPassword',
      };

      const expectedUserResult = {
        id: 'new-user-id',
        name: createUserInput.name,
        email: createUserInput.email,
        avatar: null,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      };
      jest.spyOn(prismaService.user, 'create').mockResolvedValue(expectedUserResult as any);

      const result = await service.create(createUserInput);

      // `create` força `role: USER` (default de segurança: o papel não vem do
      // cliente, é fixado no servidor), então a chamada ao Prisma o inclui.
      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: { ...createUserInput, role: Role.USER },
        omit: { password: true },
      });
      expect(result).toEqual(expectedUserResult);
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('findById', () => {
    it('should return a user by ID and omit password', async () => {
      const id = 'user1';
      jest.spyOn(prismaService.user, 'findFirst').mockResolvedValue(mockUserWithoutPassword as any);

      const result = await service.findById(id);

      expect(prismaService.user.findFirst).toHaveBeenCalledWith({
        where: { id },
        omit: { password: true },
        include: { createProjects: { select: { id: true, name: true, description: true } } },
      });
      expect(result).toEqual(mockUserWithoutPassword);
      expect(result).not.toHaveProperty('password');
    });

    it('should return null if user not found by ID', async () => {
      const id = 'nonexistent-id';
      jest.spyOn(prismaService.user, 'findFirst').mockResolvedValue(null);

      const result = await service.findById(id);

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should return a user by email (including password)', async () => {
      const email = 'test@example.com';
      jest.spyOn(prismaService.user, 'findFirst').mockResolvedValue(mockUser as any);

      const result = await service.findByEmail(email);

      expect(prismaService.user.findFirst).toHaveBeenCalledWith({
        where: { email },
      });
      expect(result).toEqual(mockUser);
      expect(result).toHaveProperty('password');
    });

    it('should return null if user not found by email', async () => {
      const email = 'nonexistent@example.com';
      jest.spyOn(prismaService.user, 'findFirst').mockResolvedValue(null);

      const result = await service.findByEmail(email);

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return a paginated list of users and omit password', async () => {
      const query: QueryPaginationDTO = { page: '1', limit: '10' };
      const paginatedResult = {
        data: [mockUserWithoutPassword],
        meta: {
          total: 1,
          currentPage: 1,
          lastPage: 1,
          nextPage: null,
          prevPage: null,
          totalPerPage: 10,
        },
      };

      jest.spyOn(prismaService.user, 'findMany').mockResolvedValue([mockUserWithoutPassword] as any);
      jest.spyOn(prismaService.user, 'count').mockResolvedValue(1);

      const result = await service.findAll(query);

      expect(prismaService.user.findMany).toHaveBeenCalledWith({ omit: { password: true }, skip: 0, take: 10 });
      expect(prismaService.user.count).toHaveBeenCalledWith({});
      expect(result.data).toEqual(paginatedResult.data);
      expect(result.meta.total).toEqual(paginatedResult.meta.total);
      expect(result.meta.totalPerPage).toEqual(paginatedResult.meta.totalPerPage);
      expect(result.data[0]).not.toHaveProperty('password');
    });
  });

  describe('update', () => {
    it('should update a user and omit password', async () => {
      const id = 'user1';
      const updateUsersDto = { name: 'Updated User' };
      const updatedUser = { ...mockUserWithoutPassword, name: 'Updated User' };

      jest.spyOn(prismaService.user, 'update').mockResolvedValue(updatedUser as any);

      const result = await service.update({ id, data: updateUsersDto });

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id },
        data: updateUsersDto,
        omit: { password: true },
      });
      expect(result).toEqual(updatedUser);
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('delete', () => {
    it('should delete a user and omit password', async () => {
      const id = 'user1';
      jest.spyOn(prismaService.user, 'delete').mockResolvedValue(mockUserWithoutPassword as any);

      const result = await service.delete(id);

      expect(prismaService.user.delete).toHaveBeenCalledWith({
        where: { id },
        omit: { password: true },
      });
      expect(result).toEqual(mockUserWithoutPassword);
      expect(result).not.toHaveProperty('password');
    });
  });
});
