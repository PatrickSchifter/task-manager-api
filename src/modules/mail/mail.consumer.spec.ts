import { Test, TestingModule } from '@nestjs/testing';
import { MailConsumer } from './mail.consumer';
import { MailService } from './mail.service';

describe('MailConsumer', () => {
  let consumer: MailConsumer;
  let mailService: MailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MailConsumer],
      providers: [
        {
          provide: MailService,
          useValue: {
            sendPasswordRequestDirect: jest.fn(),
          },
        },
      ],
    }).compile();

    consumer = module.get<MailConsumer>(MailConsumer);
    mailService = module.get<MailService>(MailService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  describe('handlePasswordReset', () => {
    it('should call mailService.sendPasswordRequestDirect with email and url', async () => {
      const data = { email: 'test@example.com', url: 'http://example.com/reset?token=abc' };

      await consumer.handlePasswordReset(data);

      expect(mailService.sendPasswordRequestDirect).toHaveBeenCalledWith(data.email, data.url);
    });
  });
});
