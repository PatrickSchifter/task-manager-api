import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard';
import { Reflector } from '@nestjs/core';
import { PrismaService } from 'src/prisma/prisma.service';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: {
            enqueue: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn(),
          },
        },
        {
          provide: Reflector,
          useValue: { get: jest.fn().mockReturnValue(false) },
        },
        {
          provide: PrismaService,
          useValue: {
            project: { findFirst: jest.fn() },
            task: { findFirst: jest.fn() },
            user: { findFirst: jest.fn() },
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<ChatController>(ChatController);
    chatService = module.get<ChatService>(ChatService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('enqueue', () => {
    it('should call chatService.enqueue and return the result', async () => {
      const dto: ChatMessageDTO = { message: 'hello' };
      const serviceResult = { id: 'msg1', userId: 'user1', content: 'hello', status: 'QUEUED' };
      jest.spyOn(chatService, 'enqueue').mockResolvedValue(serviceResult as any);

      const result = await controller.enqueue(dto);

      expect(chatService.enqueue).toHaveBeenCalledWith(dto);
      expect(result).toEqual(serviceResult);
    });
  });

  describe('findById', () => {
    it('should call chatService.findById and return the result', async () => {
      const serviceResult = { id: 'msg1', content: 'hello' };
      jest.spyOn(chatService, 'findById').mockResolvedValue(serviceResult as any);

      const result = await controller.findById('msg1');

      expect(chatService.findById).toHaveBeenCalledWith('msg1');
      expect(result).toEqual(serviceResult);
    });
  });

  describe('findAll', () => {
    it('should call chatService.findAll with default limit', async () => {
      const query: ChatMessagesQueryDTO = {};
      const serviceResult = [{ id: 'msg1', content: 'hello' }];
      jest.spyOn(chatService, 'findAll').mockResolvedValue(serviceResult as any);

      const result = await controller.findAll(query);

      expect(chatService.findAll).toHaveBeenCalledWith(20);
      expect(result).toEqual(serviceResult);
    });

    it('should call chatService.findAll with custom limit', async () => {
      const query: ChatMessagesQueryDTO = { limit: 5 };
      const serviceResult = [{ id: 'msg1', content: 'hello' }];
      jest.spyOn(chatService, 'findAll').mockResolvedValue(serviceResult as any);

      const result = await controller.findAll(query);

      expect(chatService.findAll).toHaveBeenCalledWith(5);
      expect(result).toEqual(serviceResult);
    });
  });
});
