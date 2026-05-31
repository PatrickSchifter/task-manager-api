import { Test, TestingModule } from '@nestjs/testing';
import { RagConsumer } from './rag.consumer';
import { RagService } from './rag.service';

describe('RagConsumer', () => {
  let consumer: RagConsumer;
  let ragService: RagService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RagConsumer],
      providers: [
        {
          provide: RagService,
          useValue: {
            processMessage: jest.fn(),
          },
        },
      ],
    }).compile();

    consumer = module.get<RagConsumer>(RagConsumer);
    ragService = module.get<RagService>(RagService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should call ragService.processMessage with messageId', async () => {
    await consumer.handleProcessMessage({ messageId: 'msg1' });

    expect(ragService.processMessage).toHaveBeenCalledWith({ messageId: 'msg1' });
  });
});
