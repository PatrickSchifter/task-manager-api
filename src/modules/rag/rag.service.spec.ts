import { Test, TestingModule } from '@nestjs/testing';
import { RagService } from './rag.service';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { EmbeddingService } from '../embedding/embedding.service';
import { ChatService } from '../chat/chat.service';
import { EMBEDDING_SERVICE } from 'src/consts';

let mockOpenAIFiltersContent = '{"status":["TODO"]}'
let mockOpenAIResponseContent = 'I found your tasks.'
let mockOpenAICallCount = 0

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: {
      create: jest.fn().mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      }),
    },
    chat: {
      completions: {
        create: jest.fn().mockImplementation(() => {
          mockOpenAICallCount++
          const content = mockOpenAICallCount === 1 ? mockOpenAIFiltersContent : mockOpenAIResponseContent
          return Promise.resolve({
            choices: [{ message: { content } }],
          })
        }),
      },
    },
  }));
});

describe('RagService', () => {
  let service: RagService;
  let embeddingService: EmbeddingService;
  let chatService: ChatService;
  let embeddingClient: ClientProxy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('sk-test-key'),
          },
        },
        {
          provide: EMBEDDING_SERVICE,
          useValue: {
            emit: jest.fn().mockReturnValue({ subscribe: jest.fn() }),
          },
        },
        {
          provide: EmbeddingService,
          useValue: {
            filterToEmbeddingIds: jest.fn(),
            searchSimilar: jest.fn(),
          },
        },
        {
          provide: ChatService,
          useValue: {
            findByIdInternal: jest.fn(),
            findByUserId: jest.fn(),
            setProcessing: jest.fn(),
            setDelivered: jest.fn(),
            setFailed: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RagService>(RagService);
    embeddingService = module.get<EmbeddingService>(EmbeddingService);
    chatService = module.get<ChatService>(ChatService);
    embeddingClient = module.get<ClientProxy>(EMBEDDING_SERVICE);

    mockOpenAIFiltersContent = '{"status":["TODO"]}';
    mockOpenAIResponseContent = 'I found your tasks.';
    mockOpenAICallCount = 0;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processMessage', () => {
    it('should process a message end-to-end', async () => {
      const chatMessage = {
        id: 'msg1',
        userId: 'user1',
        content: 'Show my TODO tasks',
        status: 'QUEUED',
      };
      const recentMessages = [
        { id: 'msg0', userId: 'user1', content: 'previous', response: 'ok', status: 'DELIVERED' },
      ];
      const allowedIds = [{ sourceType: 'TASK', sourceId: 'task1' }];
      const similar = [
        { sourceType: 'TASK', sourceId: 'task1', content: 'Task 1', similarity: 0.95 },
      ];

      jest.spyOn(chatService, 'findByIdInternal').mockResolvedValue(chatMessage as any);
      jest.spyOn(chatService, 'findByUserId').mockResolvedValue(recentMessages as any);
      jest.spyOn(embeddingService, 'filterToEmbeddingIds').mockResolvedValue(allowedIds as any);
      jest.spyOn(embeddingService, 'searchSimilar').mockResolvedValue(similar as any);
      jest.spyOn(chatService, 'setProcessing').mockResolvedValue(undefined as any);
      jest.spyOn(chatService, 'setDelivered').mockResolvedValue(undefined as any);

      await service.processMessage({ messageId: 'msg1' });

      expect(chatService.findByIdInternal).toHaveBeenCalledWith('msg1');
      expect(chatService.findByUserId).toHaveBeenCalledWith('user1', 6);
      expect(embeddingService.filterToEmbeddingIds).toHaveBeenCalledWith('user1', {
        status: ['TODO'],
      });
      expect(embeddingService.searchSimilar).toHaveBeenCalledWith({
        userId: 'user1',
        query: 'Show my TODO tasks',
        allowedSourceIds: allowedIds,
      });
      expect(chatService.setDelivered).toHaveBeenCalled();
    });

    it('should log error if message not found', async () => {
      jest.spyOn(chatService, 'findByIdInternal').mockResolvedValue(null);
      const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

      await service.processMessage({ messageId: 'nonexistent' });

      expect(loggerSpy).toHaveBeenCalledWith('ChatMessage nonexistent not found');
    });

    it('should deliver fallback when filters match nothing', async () => {
      const chatMessage = {
        id: 'msg1',
        userId: 'user1',
        content: 'Show my TODO tasks',
        status: 'QUEUED',
      };

      jest.spyOn(chatService, 'findByIdInternal').mockResolvedValue(chatMessage as any);
      jest.spyOn(chatService, 'findByUserId').mockResolvedValue([] as any);
      jest.spyOn(embeddingService, 'filterToEmbeddingIds').mockResolvedValue([] as any);
      jest.spyOn(embeddingService, 'searchSimilar').mockResolvedValue([] as any);
      jest.spyOn(chatService, 'setDelivered').mockResolvedValue(undefined as any);

      await service.processMessage({ messageId: 'msg1' });

      expect(chatService.setDelivered).toHaveBeenCalledWith(
        'msg1',
        "I couldn't find any relevant information for your question.",
      );
    });

    it('should deliver fallback when no filters and no similar results', async () => {
      mockOpenAIFiltersContent = '{}'

      const chatMessage = {
        id: 'msg2',
        userId: 'user1',
        content: 'Hello',
        status: 'QUEUED',
      };

      jest.spyOn(chatService, 'findByIdInternal').mockResolvedValue(chatMessage as any);
      jest.spyOn(chatService, 'findByUserId').mockResolvedValue([] as any);
      jest.spyOn(embeddingService, 'searchSimilar').mockResolvedValue([] as any);
      jest.spyOn(chatService, 'setDelivered').mockResolvedValue(undefined as any);

      await service.processMessage({ messageId: 'msg2' });

      expect(chatService.setDelivered).toHaveBeenCalledWith(
        'msg2',
        "I couldn't find any relevant information for your question.",
      );
    });

    it('should call setFailed on processing error', async () => {
      const chatMessage = {
        id: 'msg1',
        userId: 'user1',
        content: 'Show my TODO tasks',
        status: 'QUEUED',
      };
      jest.spyOn(chatService, 'findByIdInternal').mockResolvedValue(chatMessage as any);
      jest.spyOn(chatService, 'findByUserId').mockRejectedValue(new Error('DB error'));
      jest.spyOn(chatService, 'setFailed').mockResolvedValue(undefined as any);

      await service.processMessage({ messageId: 'msg1' });

      expect(chatService.setFailed).toHaveBeenCalledWith('msg1');
    });

    it('should handle invalid JSON from OpenAI filters call', async () => {
      mockOpenAIFiltersContent = 'not valid json';

      const chatMessage = {
        id: 'msg3',
        userId: 'user1',
        content: 'Hello',
        status: 'QUEUED',
      };

      jest.spyOn(chatService, 'findByIdInternal').mockResolvedValue(chatMessage as any);
      jest.spyOn(chatService, 'findByUserId').mockResolvedValue([] as any);
      jest.spyOn(embeddingService, 'searchSimilar').mockResolvedValue([] as any);
      jest.spyOn(chatService, 'setDelivered').mockResolvedValue(undefined as any);

      await service.processMessage({ messageId: 'msg3' });

      expect(chatService.setDelivered).toHaveBeenCalled();
    });
  });

  describe('dispatch methods', () => {
    it('should dispatch task embedding', () => {
      service.dispatchTaskEmbedding('task1');
      expect(embeddingClient.emit).toHaveBeenCalledWith('GENERATE_TASK_EMBEDDING', { taskId: 'task1' });
    });

    it('should handle null content from OpenAI filters call', async () => {
      mockOpenAIFiltersContent = null as any;

      const chatMessage = {
        id: 'msg4',
        userId: 'user1',
        content: 'Hello',
        status: 'QUEUED',
      };

      jest.spyOn(chatService, 'findByIdInternal').mockResolvedValue(chatMessage as any);
      jest.spyOn(chatService, 'findByUserId').mockResolvedValue([] as any);
      jest.spyOn(embeddingService, 'searchSimilar').mockResolvedValue([] as any);
      jest.spyOn(chatService, 'setDelivered').mockResolvedValue(undefined as any);

      await service.processMessage({ messageId: 'msg4' });

      expect(chatService.setDelivered).toHaveBeenCalled();
    });

    it('should handle null content from OpenAI response call', async () => {
      mockOpenAIFiltersContent = '{}';
      mockOpenAIResponseContent = null as any;

      const chatMessage = {
        id: 'msg5',
        userId: 'user1',
        content: 'Hello',
        status: 'QUEUED',
      };
      const similar = [
        { sourceType: 'TASK', sourceId: 'task1', content: 'Task 1', similarity: 0.95 },
      ];

      jest.spyOn(chatService, 'findByIdInternal').mockResolvedValue(chatMessage as any);
      jest.spyOn(chatService, 'findByUserId').mockResolvedValue([] as any);
      jest.spyOn(embeddingService, 'searchSimilar').mockResolvedValue(similar as any);
      jest.spyOn(chatService, 'setDelivered').mockResolvedValue(undefined as any);

      await service.processMessage({ messageId: 'msg5' });

      expect(chatService.setDelivered).toHaveBeenCalled();
    });

    it('should handle dispatch errors', () => {
      jest.spyOn(embeddingClient, 'emit').mockReturnValue({
        subscribe: jest.fn().mockImplementation((callbacks: any) => {
          if (typeof callbacks === 'function') {
            callbacks();
          } else if (callbacks?.error) {
            callbacks.error(new Error('Emit failed'));
          }
        }),
      } as any);
      const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

      service.dispatchTaskEmbedding('task1');

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to dispatch GENERATE_TASK_EMBEDDING',
        expect.any(Error),
      );
    });

    it('should dispatch comment embedding', () => {
      service.dispatchCommentEmbedding('comment1');
      expect(embeddingClient.emit).toHaveBeenCalledWith('GENERATE_COMMENT_EMBEDDING', { commentId: 'comment1' });
    });

    it('should dispatch project embedding', () => {
      service.dispatchProjectEmbedding('project1');
      expect(embeddingClient.emit).toHaveBeenCalledWith('GENERATE_PROJECT_EMBEDDING', { projectId: 'project1' });
    });

    it('should dispatch delete', () => {
      service.dispatchDelete('TASK', 'task1');
      expect(embeddingClient.emit).toHaveBeenCalledWith('DELETE_EMBEDDING', { sourceType: 'TASK', sourceId: 'task1' });
    });

    it('should dispatch project delete', () => {
      service.dispatchProjectDelete('project1');
      expect(embeddingClient.emit).toHaveBeenCalledWith('DELETE_EMBEDDING_BY_PROJECT', { projectId: 'project1' });
    });

    it('should dispatch task delete', () => {
      service.dispatchTaskDelete('task1');
      expect(embeddingClient.emit).toHaveBeenCalledWith('DELETE_TASK_EMBEDDING', { taskId: 'task1' });
    });
  });
});
