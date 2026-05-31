import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { RequestContextService } from 'src/common/services/request-context/request-context.service';
import { ClientProxy } from '@nestjs/microservices';
import { CHAT_SERVICE, PROCESS_CHAT_MESSAGE } from 'src/consts';
import { MessageStatus } from 'src/generated/prisma/enums';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: PrismaService;
  let requestContext: RequestContextService;
  let chatClient: ClientProxy;

  const mockMessage = {
    id: 'msg1',
    userId: 'user1',
    content: 'hello',
    status: 'QUEUED',
    response: null,
    filters: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: PrismaService,
          useValue: {
            chatMessage: {
              create: jest.fn().mockResolvedValue(mockMessage),
              update: jest.fn().mockResolvedValue(mockMessage),
              findFirst: jest.fn().mockResolvedValue(mockMessage),
              findUnique: jest.fn().mockResolvedValue(mockMessage),
              findMany: jest.fn().mockResolvedValue([mockMessage]),
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
          provide: CHAT_SERVICE,
          useValue: {
            emit: jest.fn().mockReturnValue({ subscribe: jest.fn() }),
          },
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    prisma = module.get<PrismaService>(PrismaService);
    requestContext = module.get<RequestContextService>(RequestContextService);
    chatClient = module.get<ClientProxy>(CHAT_SERVICE);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('enqueue', () => {
    it('should create a chat message and emit to queue', async () => {
      const data = { message: 'hello' };

      const result = await service.enqueue(data);

      expect(prisma.chatMessage.create).toHaveBeenCalledWith({
        data: { userId: 'user1', content: 'hello', status: MessageStatus.QUEUED },
      });
      expect(chatClient.emit).toHaveBeenCalledWith(PROCESS_CHAT_MESSAGE, { messageId: 'msg1' });
      expect(result).toEqual(mockMessage);
    });
  });

  describe('setProcessing', () => {
    it('should update status to PROCESSING', async () => {
      const filters = { status: ['TODO'] };
      await service.setProcessing('msg1', filters);

      expect(prisma.chatMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg1' },
        data: { status: MessageStatus.PROCESSING, filters },
      });
    });
  });

  describe('setDelivered', () => {
    it('should update status to DELIVERED with response', async () => {
      await service.setDelivered('msg1', 'Here is the answer');

      expect(prisma.chatMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg1' },
        data: { status: MessageStatus.DELIVERED, response: 'Here is the answer' },
      });
    });
  });

  describe('setFailed', () => {
    it('should update status to FAILED', async () => {
      await service.setFailed('msg1');

      expect(prisma.chatMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg1' },
        data: { status: MessageStatus.FAILED },
      });
    });
  });

  describe('findById', () => {
    it('should return a message by id filtered by user', async () => {
      const result = await service.findById('msg1');

      expect(requestContext.getUserId).toHaveBeenCalled();
      expect(prisma.chatMessage.findFirst).toHaveBeenCalledWith({
        where: { id: 'msg1', userId: 'user1' },
      });
      expect(result).toEqual(mockMessage);
    });
  });

  describe('findByIdInternal', () => {
    it('should return a message by id without user filter', async () => {
      const result = await service.findByIdInternal('msg1');

      expect(prisma.chatMessage.findUnique).toHaveBeenCalledWith({ where: { id: 'msg1' } });
      expect(result).toEqual(mockMessage);
    });
  });

  describe('findAll', () => {
    it('should return messages for the current user', async () => {
      const result = await service.findAll(5);

      expect(requestContext.getUserId).toHaveBeenCalled();
      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { userId: 'user1' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      expect(result).toEqual([mockMessage]);
    });
  });

  describe('findByUserId', () => {
    it('should return messages for a specific user', async () => {
      const result = await service.findByUserId('user2', 3);

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { userId: 'user2' },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
      expect(result).toEqual([mockMessage]);
    });
  });
});
