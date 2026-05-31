import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { RequestContextService } from 'src/common/services/request-context/request-context.service';
import { NotFoundException } from '@nestjs/common';
import { RagService } from '../rag/rag.service';

describe('CommentsService', () => {
  let service: CommentsService;
  let prismaService: PrismaService;
  let requestContextService: RequestContextService;

  const mockComment = {
    id: 'comment1',
    content: 'Test Comment',
    taskId: 'task1',
    authorId: 'user1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const authorAttributes = {
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        {
          provide: PrismaService,
          useValue: {
            comment: {
              create: jest.fn().mockResolvedValue(mockComment),
              findFirst: jest.fn().mockResolvedValue(mockComment),
              findMany: jest.fn().mockResolvedValue([mockComment]),
              count: jest.fn().mockResolvedValue(1),
              update: jest.fn().mockResolvedValue(mockComment),
              delete: jest.fn().mockResolvedValue(undefined),
            },
          },
        },
        {
          provide: RequestContextService,
          useValue: {
            getUserId: jest.fn().mockReturnValue('user1'),
          },
        },
        {
          provide: RagService,
          useValue: {
            dispatchCommentEmbedding: jest.fn(),
            dispatchDelete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    prismaService = module.get<PrismaService>(PrismaService);
    requestContextService = module.get<RequestContextService>(RequestContextService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new comment', async () => {
      const addCommentDto = { content: 'New Comment' };
      const taskId = 'task1';
      const userId = 'user1';

      const expectedComment = { ...mockComment, content: 'New Comment', taskId, authorId: userId };
      jest.spyOn(prismaService.comment, 'create').mockResolvedValue(expectedComment as any);

      const result = await service.create({ data: addCommentDto, taskId });

      expect(requestContextService.getUserId).toHaveBeenCalled();
      expect(prismaService.comment.create).toHaveBeenCalledWith({
        data: {
          ...addCommentDto,
          task: { connect: { id: taskId } },
          author: { connect: { id: userId } },
        },
        include: { author: authorAttributes },
      });
      expect(result).toEqual(expectedComment);
    });
  });

  describe('findById', () => {
    it('should return a comment by task ID', async () => {
      const taskId = 'task1';
      jest.spyOn(prismaService.comment, 'findFirst').mockResolvedValue(mockComment as any);

      const result = await service.findById(taskId);

      expect(prismaService.comment.findFirst).toHaveBeenCalledWith({
        where: { taskId },
        include: {
          author: authorAttributes,
          task: { select: { id: true, title: true, projectId: true } },
        },
      });
      expect(result).toEqual(mockComment);
    });
  });

  describe('findByTaskId', () => {
    it('should return paginated comments for a given task ID', async () => {
      const taskId = 'task1';
      const query = { page: 1, limit: 10 };
      const paginatedResult = {
        data: [mockComment],
        meta: {
          total: 1,
          currentPage: 1,
          lastPage: 1,
          nextPage: null,
          prevPage: null,
          totalPerPage: 10,
        },
      };

      jest.spyOn(prismaService.comment, 'count').mockResolvedValue(1);
      jest.spyOn(prismaService.comment, 'findMany').mockResolvedValue([mockComment] as any);

      const result = await service.findByTaskId({ taskId, query });

      expect(prismaService.comment.count).toHaveBeenCalledWith({ where: { taskId } });
      expect(prismaService.comment.findMany).toHaveBeenCalledWith({
        where: { taskId },
        skip: 0,
        take: 10,
        include: { author: authorAttributes },
      });
      expect(result.data).toEqual(paginatedResult.data);
      expect(result.meta.total).toEqual(paginatedResult.meta.total);
      expect(result.meta.totalPerPage).toEqual(paginatedResult.meta.totalPerPage);
    });
  });

  describe('findByAuthorId', () => {
    it('should return comments by author ID', async () => {
      const authorId = 'user1';
      jest.spyOn(prismaService.comment, 'findMany').mockResolvedValue([mockComment] as any);

      const result = await service.findByAuthorId(authorId);

      expect(prismaService.comment.findMany).toHaveBeenCalledWith({
        where: { authorId },
        include: { author: authorAttributes },
      });
      expect(result).toEqual([mockComment]);
    });
  });

  describe('update', () => {
    it('should update an existing comment', async () => {
      const updateCommentDto = { content: 'Updated Comment' };
      const commentId = 'comment1';
      const userId = 'user1';
      const updatedComment = { ...mockComment, content: 'Updated Comment' };

      jest.spyOn(prismaService.comment, 'findFirst').mockResolvedValue(mockComment as any);
      jest.spyOn(prismaService.comment, 'update').mockResolvedValue(updatedComment as any);

      const result = await service.update({ data: updateCommentDto, id: commentId });

      expect(requestContextService.getUserId).toHaveBeenCalled();
      expect(prismaService.comment.findFirst).toHaveBeenCalledWith({ where: { id: commentId } });
      expect(prismaService.comment.update).toHaveBeenCalledWith({
        where: {
          id: commentId,
          authorId: userId,
        },
        data: updateCommentDto,
        include: { author: authorAttributes },
      });
      expect(result).toEqual(updatedComment);
    });

    it('should throw NotFoundException if comment not found for update', async () => {
      const updateCommentDto = { content: 'Updated Comment' };
      const commentId = 'nonexistentComment';

      jest.spyOn(prismaService.comment, 'findFirst').mockResolvedValue(null);

      await expect(service.update({ data: updateCommentDto, id: commentId })).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete a comment', async () => {
      const commentId = 'comment1';
      const userId = 'user1';

      jest.spyOn(prismaService.comment, 'findFirst').mockResolvedValue(mockComment as any);
      jest.spyOn(prismaService.comment, 'delete').mockResolvedValue(undefined);

      await service.delete(commentId);

      expect(requestContextService.getUserId).toHaveBeenCalled();
      expect(prismaService.comment.findFirst).toHaveBeenCalledWith({
        where: { id: commentId, authorId: userId },
      });
      expect(prismaService.comment.delete).toHaveBeenCalledWith({
        where: { id: commentId, authorId: userId },
      });
    });

    it('should throw NotFoundException if comment not found for delete', async () => {
      const commentId = 'nonexistentComment';

      jest.spyOn(prismaService.comment, 'findFirst').mockResolvedValue(null);

      await expect(service.delete(commentId)).rejects.toThrow(NotFoundException);
    });
  });
});
