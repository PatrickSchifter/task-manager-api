import { CustomThrottlerGuard } from './throttler.guard'

// Subclasse de teste para expor o método protegido `getTracker`.
class TestableGuard extends CustomThrottlerGuard {
  public getTrackerPublic(req: Record<string, any>): Promise<string> {
    return this.getTracker(req)
  }
}

// Monta um JWT falso (header.payload.signature) com o payload informado.
function fakeJwt(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${body}.signature`
}

describe('CustomThrottlerGuard.getTracker', () => {
  let guard: TestableGuard

  beforeEach(() => {
    // Os internals do ThrottlerGuard não são exercidos aqui; só getTracker.
    guard = Object.create(TestableGuard.prototype) as TestableGuard
  })

  it('tracks by user id when a valid bearer token is present', async () => {
    const req = {
      headers: { authorization: `Bearer ${fakeJwt({ sub: 'user-123' })}` },
    }
    await expect(guard.getTrackerPublic(req)).resolves.toBe('user:user-123')
  })

  it('falls back to ip + email when there is no token', async () => {
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.5, 70.41.3.18' },
      body: { email: 'User@Example.com ' },
    }
    await expect(guard.getTrackerPublic(req)).resolves.toBe('203.0.113.5:user@example.com')
  })

  it('uses the first ip from x-forwarded-for', async () => {
    const req = {
      headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' },
      body: {},
    }
    await expect(guard.getTrackerPublic(req)).resolves.toBe('1.1.1.1:no-email')
  })

  it('falls back to socket.remoteAddress when no forwarded header', async () => {
    const req = {
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
      body: {},
    }
    await expect(guard.getTrackerPublic(req)).resolves.toBe('10.0.0.1:no-email')
  })

  it('falls back to req.ip when no socket address', async () => {
    const req = { headers: {}, ip: '10.0.0.9', body: {} }
    await expect(guard.getTrackerPublic(req)).resolves.toBe('10.0.0.9:no-email')
  })

  it('uses "unknown" when no ip can be determined', async () => {
    const req = { headers: {}, body: {} }
    await expect(guard.getTrackerPublic(req)).resolves.toBe('unknown:no-email')
  })

  it('ignores a non-bearer authorization header', async () => {
    const req = {
      headers: { authorization: 'Basic abc123' },
      ip: '10.0.0.1',
      body: {},
    }
    await expect(guard.getTrackerPublic(req)).resolves.toBe('10.0.0.1:no-email')
  })

  it('ignores a malformed bearer token', async () => {
    const req = {
      headers: { authorization: 'Bearer not-a-jwt' },
      ip: '10.0.0.1',
      body: {},
    }
    await expect(guard.getTrackerPublic(req)).resolves.toBe('10.0.0.1:no-email')
  })

  it('ignores a token whose payload is not valid JSON', async () => {
    const req = {
      headers: { authorization: 'Bearer header.%%%notbase64json%%%.sig' },
      ip: '10.0.0.1',
      body: {},
    }
    await expect(guard.getTrackerPublic(req)).resolves.toBe('10.0.0.1:no-email')
  })

  it('ignores a token without a sub claim', async () => {
    const req = {
      headers: { authorization: `Bearer ${fakeJwt({ name: 'no-sub' })}` },
      ip: '10.0.0.1',
      body: {},
    }
    await expect(guard.getTrackerPublic(req)).resolves.toBe('10.0.0.1:no-email')
  })

  it('handles a missing body gracefully', async () => {
    const req = { headers: {}, ip: '10.0.0.1' }
    await expect(guard.getTrackerPublic(req)).resolves.toBe('10.0.0.1:no-email')
  })
})
