import { Test, TestingModule } from '@nestjs/testing';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';

describe('McpController', () => {
  let controller: McpController;
  let mcpService: McpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        {
          provide: McpService,
          useValue: {
            processRequest: jest.fn(),
            getCapabilities: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true), // Mock JwtAuthGuard to always allow activation
      })
      .compile();

    controller = module.get<McpController>(McpController);
    mcpService = module.get<McpService>(McpService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('processRequest', () => {
    it('should call mcpService.processRequest with user ID from request', async () => {
      const prompt = 'Create a task';
      const context = { projectId: 'project1' };
      const userId = 'user123';
      const req = { user: { id: userId } };
      const serviceResult = { response: 'Task created', actions: [] };

      jest.spyOn(mcpService, 'processRequest').mockResolvedValue(serviceResult);

      const result = await controller.processRequest({ prompt, context }, req);

      expect(mcpService.processRequest).toHaveBeenCalledWith(prompt, { ...context, userId });
      expect(result).toEqual(serviceResult);
    });

    it('should call mcpService.processRequest without user ID if not present', async () => {
      const prompt = 'Get capabilities';
      const context = { projectId: 'project1' };
      const req = { user: undefined };
      const serviceResult = { response: 'Capabilities listed', actions: [] };

      jest.spyOn(mcpService, 'processRequest').mockResolvedValue(serviceResult);

      const result = await controller.processRequest({ prompt, context }, req);

      expect(mcpService.processRequest).toHaveBeenCalledWith(prompt, context);
      expect(result).toEqual(serviceResult);
    });

    it('should default actions to empty array when not returned', async () => {
      const prompt = 'Hello';
      const req = { user: { id: 'user1' } };
      const serviceResult = { response: 'Hello back' };

      jest.spyOn(mcpService, 'processRequest').mockResolvedValue(serviceResult as any);

      const result = await controller.processRequest({ prompt }, req);

      expect(result).toEqual({ response: 'Hello back', actions: [] });
    });
  });

  describe('getCapabilities', () => {
    it('should call mcpService.getCapabilities and return the result', () => {
      const serviceResult = { resources: [], tools: [] };
      jest.spyOn(mcpService, 'getCapabilities').mockReturnValue(serviceResult);

      const result = controller.getCapabilities();

      expect(mcpService.getCapabilities).toHaveBeenCalled();
      expect(result).toEqual(serviceResult);
    });
  });

  describe('executeAction', () => {
    it('should return a success message for executing an action', async () => {
      const actionType = 'create_task';
      const payload = { title: 'New Task' };
      const req = { user: { id: 'user123' } };

      const result = await controller.executeAction({ actionType, payload }, req);

      expect(result).toEqual({
        success: true,
        message: `Action ${actionType} executed`,
        data: payload,
      });
    });
  });
});
