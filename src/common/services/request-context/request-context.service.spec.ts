import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  let service: RequestContextService;

  beforeEach(() => {
    service = new RequestContextService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should set and get the user', () => {
    const user = { id: 'user1', name: 'Test', email: 'test@test.com' } as any;
    service.setUser(user);

    expect(service.getUser()).toEqual(user);
  });

  it('should return the user id', () => {
    const user = { id: 'user1', name: 'Test', email: 'test@test.com' } as any;
    service.setUser(user);

    expect(service.getUserId()).toEqual('user1');
  });

  it('should handle being called without setting user first', () => {
    expect(() => service.getUserId()).toThrow();
  });
});
