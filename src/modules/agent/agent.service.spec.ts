import { ConfigService } from '@nestjs/config'
import { AgentService } from './agent.service'
import type { AgentProvider } from './providers/agent-provider'

type ConfigOverrides = Record<string, unknown>

const makeConfig = (over: ConfigOverrides = {}): ConfigService =>
  ({
    get: jest.fn(
      (k: string) =>
        ({ 'agent.provider': 'anthropic', 'agent.escalateInvites': false, ...over })[k],
    ),
  }) as unknown as ConfigService

describe('AgentService', () => {
  let chat: any
  let anthropic: jest.Mocked<AgentProvider>
  let openai: jest.Mocked<AgentProvider>

  beforeEach(() => {
    chat = {
      findByIdInternal: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue([]),
      setProcessing: jest.fn().mockResolvedValue(undefined),
      setDelivered: jest.fn().mockResolvedValue(undefined),
      setFailed: jest.fn().mockResolvedValue(undefined),
    }
    anthropic = { name: 'anthropic', run: jest.fn() } as any
    openai = { name: 'openai', run: jest.fn() } as any
  })

  const build = (cfg: ConfigOverrides = {}) =>
    new AgentService(chat, makeConfig(cfg), anthropic, openai)

  it('logs and stops when the message is not found', async () => {
    chat.findByIdInternal.mockResolvedValue(null)
    const service = build()
    const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {})

    await service.processMessage({ messageId: 'missing' })

    expect(loggerSpy).toHaveBeenCalledWith('ChatMessage missing not found')
    expect(chat.setProcessing).not.toHaveBeenCalled()
  })

  it('delivers the provider text and actions', async () => {
    chat.findByIdInternal.mockResolvedValue({ id: 'm1', userId: 'u1', content: 'hi' })
    anthropic.run.mockResolvedValue({
      text: 'done',
      actions: [{ tool: 'create_project', input: { name: 'X' }, result: { ok: true } }],
    })
    const service = build()

    await service.processMessage({ messageId: 'm1' })

    expect(chat.setProcessing).toHaveBeenCalledWith('m1', {})
    expect(anthropic.run).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'hi', actorId: 'u1' }),
    )
    expect(chat.setDelivered).toHaveBeenCalledWith(
      'm1',
      'done',
      expect.arrayContaining([expect.objectContaining({ tool: 'create_project' })]),
    )
  })

  it('passes undefined actions when none were executed', async () => {
    chat.findByIdInternal.mockResolvedValue({ id: 'm1', userId: 'u1', content: 'hi' })
    anthropic.run.mockResolvedValue({ text: 'just an answer', actions: [] })
    const service = build()

    await service.processMessage({ messageId: 'm1' })

    expect(chat.setDelivered).toHaveBeenCalledWith('m1', 'just an answer', undefined)
  })

  it('marks the message failed on provider error', async () => {
    chat.findByIdInternal.mockResolvedValue({ id: 'm1', userId: 'u1', content: 'hi' })
    anthropic.run.mockRejectedValue(new Error('boom'))
    const service = build()
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => {})

    await service.processMessage({ messageId: 'm1' })

    expect(chat.setFailed).toHaveBeenCalledWith('m1')
  })

  it('uses the configured primary provider (openai)', async () => {
    chat.findByIdInternal.mockResolvedValue({ id: 'm1', userId: 'u1', content: 'what tasks?' })
    openai.run.mockResolvedValue({ text: 'ok', actions: [] })
    const service = build({ 'agent.provider': 'openai' })

    await service.processMessage({ messageId: 'm1' })

    expect(openai.run).toHaveBeenCalled()
    expect(anthropic.run).not.toHaveBeenCalled()
  })

  it('escalates invite-intent messages to anthropic when enabled', async () => {
    chat.findByIdInternal.mockResolvedValue({
      id: 'm1',
      userId: 'u1',
      content: 'Invite bob@acme.com to the Marketing project as editor',
    })
    anthropic.run.mockResolvedValue({ text: 'invited', actions: [] })
    const service = build({ 'agent.provider': 'openai', 'agent.escalateInvites': true })

    await service.processMessage({ messageId: 'm1' })

    expect(anthropic.run).toHaveBeenCalled()
    expect(openai.run).not.toHaveBeenCalled()
  })

  it('keeps non-invite messages on the primary even with escalation on', async () => {
    chat.findByIdInternal.mockResolvedValue({
      id: 'm1',
      userId: 'u1',
      content: 'Create a task to write the report',
    })
    openai.run.mockResolvedValue({ text: 'created', actions: [] })
    const service = build({ 'agent.provider': 'openai', 'agent.escalateInvites': true })

    await service.processMessage({ messageId: 'm1' })

    expect(openai.run).toHaveBeenCalled()
    expect(anthropic.run).not.toHaveBeenCalled()
  })
})
