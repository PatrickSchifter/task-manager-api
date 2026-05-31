import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingConsumer } from './embedding.consumer';
import { EmbeddingService } from './embedding.service';
import {
  GENERATE_TASK_EMBEDDING,
  GENERATE_COMMENT_EMBEDDING,
  GENERATE_PROJECT_EMBEDDING,
  DELETE_EMBEDDING,
  DELETE_EMBEDDING_BY_PROJECT,
  DELETE_TASK_EMBEDDING,
} from 'src/consts';

describe('EmbeddingConsumer', () => {
  let consumer: EmbeddingConsumer;
  let embeddingService: EmbeddingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmbeddingConsumer],
      providers: [
        {
          provide: EmbeddingService,
          useValue: {
            generateForTask: jest.fn(),
            generateForComment: jest.fn(),
            generateForProject: jest.fn(),
            deleteBySource: jest.fn(),
            deleteByProject: jest.fn(),
            deleteByTask: jest.fn(),
          },
        },
      ],
    }).compile();

    consumer = module.get<EmbeddingConsumer>(EmbeddingConsumer);
    embeddingService = module.get<EmbeddingService>(EmbeddingService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should handle task embedding generation', async () => {
    await consumer.handleTaskEmbedding({ taskId: 'task1' });
    expect(embeddingService.generateForTask).toHaveBeenCalledWith('task1');
  });

  it('should handle comment embedding generation', async () => {
    await consumer.handleCommentEmbedding({ commentId: 'comment1' });
    expect(embeddingService.generateForComment).toHaveBeenCalledWith('comment1');
  });

  it('should handle project embedding generation', async () => {
    await consumer.handleProjectEmbedding({ projectId: 'project1' });
    expect(embeddingService.generateForProject).toHaveBeenCalledWith('project1');
  });

  it('should handle embedding deletion', async () => {
    await consumer.handleDeleteEmbedding({ sourceType: 'TASK', sourceId: 'task1' });
    expect(embeddingService.deleteBySource).toHaveBeenCalledWith('TASK', 'task1');
  });

  it('should handle project embedding deletion', async () => {
    await consumer.handleDeleteByProject({ projectId: 'project1' });
    expect(embeddingService.deleteByProject).toHaveBeenCalledWith('project1');
  });

  it('should handle task embedding deletion', async () => {
    await consumer.handleDeleteByTask({ taskId: 'task1' });
    expect(embeddingService.deleteByTask).toHaveBeenCalledWith('task1');
  });
});
