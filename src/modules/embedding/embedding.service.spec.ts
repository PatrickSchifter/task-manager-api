import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingService } from './embedding.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { EmbeddingSourceType } from 'src/generated/prisma/client';

const mockEmbeddingResponse = {
  data: [{ embedding: [0.1, 0.2, 0.3] }],
};

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: {
      create: jest.fn().mockResolvedValue(mockEmbeddingResponse),
    },
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }));
});

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let prisma: PrismaService;

  const mockTask = {
    id: 'task1',
    title: 'Test Task',
    description: 'A test task',
    status: 'TODO',
    priority: 'HIGH',
    dueDate: new Date('2026-06-15'),
    projectId: 'project1',
    assigneeId: 'user1',
    project: { name: 'Test Project' },
    assignee: { name: 'Test User' },
  };

  const mockComment = {
    id: 'comment1',
    content: 'Test comment',
    taskId: 'task1',
    authorId: 'user1',
    task: { id: 'task1', title: 'Test Task', projectId: 'project1' },
    author: { name: 'Test User' },
  };

  const mockProject = {
    id: 'project1',
    name: 'Test Project',
    description: 'A test project',
    createdById: 'user1',
    createdBy: { name: 'Test User' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        {
          provide: PrismaService,
          useValue: {
            task: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            comment: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            project: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            embedding: {
              deleteMany: jest.fn(),
            },
            $executeRaw: jest.fn(),
            $queryRaw: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('sk-test-key'),
          },
        },
      ],
    }).compile();

    service = module.get<EmbeddingService>(EmbeddingService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateForTask', () => {
    it('should generate embedding for a task', async () => {
      jest.spyOn(prisma.task, 'findUnique').mockResolvedValue(mockTask as any);
      jest.spyOn(prisma, '$executeRaw').mockResolvedValue(undefined);

      await service.generateForTask('task1');

      expect(prisma.task.findUnique).toHaveBeenCalledWith({
        where: { id: 'task1' },
        include: { project: { select: { name: true } }, assignee: { select: { name: true } } },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should generate embedding for a task without optional fields', async () => {
      const minimalTask = {
        id: 'task2',
        title: 'Minimal Task',
        description: null,
        status: 'TODO',
        priority: 'LOW',
        dueDate: null,
        projectId: 'project1',
        assigneeId: null,
        project: { name: 'Test Project' },
        assignee: null,
      };
      jest.spyOn(prisma.task, 'findUnique').mockResolvedValue(minimalTask as any);
      jest.spyOn(prisma, '$executeRaw').mockResolvedValue(undefined);

      await service.generateForTask('task2');

      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should throw NotFoundException if task not found', async () => {
      jest.spyOn(prisma.task, 'findUnique').mockResolvedValue(null);

      await expect(service.generateForTask('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateForComment', () => {
    it('should generate embedding for a comment', async () => {
      jest.spyOn(prisma.comment, 'findUnique').mockResolvedValue(mockComment as any);
      jest.spyOn(prisma, '$executeRaw').mockResolvedValue(undefined);

      await service.generateForComment('comment1');

      expect(prisma.comment.findUnique).toHaveBeenCalledWith({
        where: { id: 'comment1' },
        include: {
          task: { select: { id: true, title: true, projectId: true } },
          author: { select: { name: true } },
        },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should throw NotFoundException if comment not found', async () => {
      jest.spyOn(prisma.comment, 'findUnique').mockResolvedValue(null);

      await expect(service.generateForComment('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateForProject', () => {
    it('should generate embedding for a project with description', async () => {
      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      jest.spyOn(prisma, '$executeRaw').mockResolvedValue(undefined);

      await service.generateForProject('project1');

      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'project1' },
        include: { createdBy: { select: { name: true } } },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should skip embedding if project has no description', async () => {
      const projectWithoutDesc = { ...mockProject, description: null };
      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(projectWithoutDesc as any);

      await service.generateForProject('project1');

      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if project not found', async () => {
      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(null);

      await expect(service.generateForProject('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteBySource', () => {
    it('should delete embedding by source type and id', async () => {
      jest.spyOn(prisma, '$executeRaw').mockResolvedValue(undefined);

      await service.deleteBySource(EmbeddingSourceType.TASK, 'task1');

      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('deleteByTask', () => {
    it('should delete embeddings by task id', async () => {
      jest.spyOn(prisma.embedding, 'deleteMany').mockResolvedValue({ count: 2 } as any);

      await service.deleteByTask('task1');

      expect(prisma.embedding.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { sourceType: 'TASK', sourceId: 'task1' },
            { sourceType: 'COMMENT', metadata: { path: ['taskId'], equals: 'task1' } },
          ],
        },
      });
    });
  });

  describe('deleteByProject', () => {
    it('should delete embeddings by project id', async () => {
      jest.spyOn(prisma.embedding, 'deleteMany').mockResolvedValue({ count: 3 } as any);

      await service.deleteByProject('project1');

      expect(prisma.embedding.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { sourceType: 'PROJECT', sourceId: 'project1' },
            { sourceType: 'TASK', metadata: { path: ['projectId'], equals: 'project1' } },
            { sourceType: 'COMMENT', metadata: { path: ['projectId'], equals: 'project1' } },
          ],
        },
      });
    });
  });

  describe('searchSimilar', () => {
    it('should search similar embeddings without allowedSourceIds', async () => {
      jest.spyOn(prisma, '$queryRaw').mockResolvedValue([
        { sourceType: 'TASK', sourceId: 'task1', content: 'test', similarity: 0.95 },
      ]);

      const results = await service.searchSimilar({ userId: 'user1', query: 'test query' });

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].similarity).toBe(0.95);
    });

    it('should search similar embeddings with allowedSourceIds', async () => {
      jest.spyOn(prisma, '$queryRaw').mockResolvedValue([
        { sourceType: 'TASK', sourceId: 'task1', content: 'test', similarity: 0.9 },
      ]);

      const results = await service.searchSimilar({
        userId: 'user1',
        query: 'test query',
        allowedSourceIds: [{ sourceType: EmbeddingSourceType.TASK, sourceId: 'task1' }],
      });

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(results).toHaveLength(1);
    });
  });

  describe('filterToEmbeddingIds', () => {
    it('should filter tasks by status and priority', async () => {
      const tasks = [{ id: 'task1' }, { id: 'task2' }];
      jest.spyOn(prisma.task, 'findMany').mockResolvedValue(tasks as any);
      jest.spyOn(prisma.comment, 'findMany').mockResolvedValue([] as any);
      jest.spyOn(prisma.project, 'findMany').mockResolvedValue([] as any);

      const result = await service.filterToEmbeddingIds('user1', {
        status: ['TODO'],
        priority: ['HIGH'],
        sourceTypes: ['TASK'],
      });

      expect(result).toEqual([
        { sourceType: EmbeddingSourceType.TASK, sourceId: 'task1' },
        { sourceType: EmbeddingSourceType.TASK, sourceId: 'task2' },
      ]);
    });

    it('should filter by all source types', async () => {
      jest.spyOn(prisma.task, 'findMany').mockResolvedValue([{ id: 'task1' }] as any);
      jest.spyOn(prisma.comment, 'findMany').mockResolvedValue([{ id: 'comment1' }] as any);
      jest.spyOn(prisma.project, 'findMany').mockResolvedValue([{ id: 'project1' }] as any);

      const result = await service.filterToEmbeddingIds('user1', {});

      expect(result).toHaveLength(3);
      expect(result).toContainEqual({ sourceType: EmbeddingSourceType.TASK, sourceId: 'task1' });
      expect(result).toContainEqual({ sourceType: EmbeddingSourceType.COMMENT, sourceId: 'comment1' });
      expect(result).toContainEqual({ sourceType: EmbeddingSourceType.PROJECT, sourceId: 'project1' });
    });

    it('should filter comments with projectId filter', async () => {
      jest.spyOn(prisma.task, 'findMany').mockResolvedValue([] as any);
      jest.spyOn(prisma.comment, 'findMany').mockResolvedValue([{ id: 'comment1' }] as any);
      jest.spyOn(prisma.project, 'findMany').mockResolvedValue([] as any);

      const result = await service.filterToEmbeddingIds('user1', {
        sourceTypes: ['COMMENT'],
        projectId: 'project1',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ sourceType: EmbeddingSourceType.COMMENT, sourceId: 'comment1' });
    });

    it('should filter projects with projectId filter', async () => {
      jest.spyOn(prisma.task, 'findMany').mockResolvedValue([] as any);
      jest.spyOn(prisma.comment, 'findMany').mockResolvedValue([] as any);
      jest.spyOn(prisma.project, 'findMany').mockResolvedValue([{ id: 'project1' }] as any);

      const result = await service.filterToEmbeddingIds('user1', {
        sourceTypes: ['PROJECT'],
        projectId: 'project1',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ sourceType: EmbeddingSourceType.PROJECT, sourceId: 'project1' });
    });
  });
});
