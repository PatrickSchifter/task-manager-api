import { ConfigService } from '@nestjs/config'
import { ToolExecutorService } from '../tool-executor.service'
import { AnthropicAgentProvider } from './anthropic-agent.provider'

let calls = 0
let responses: unknown[] = []

jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockImplementation(() => {
        const r = responses[calls] ?? {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Default.' }],
        }
        calls++
        return Promise.resolve(r)
      }),
    },
  })),
)

const config = {
  getOrThrow: jest
    .fn()
    .mockImplementation((k: string) =>
      k === 'anthropic.model' ? 'claude-sonnet-4-6' : 'sk-ant-test',
    ),
} as unknown as ConfigService

describe('AnthropicAgentProvider', () => {
  let provider: AnthropicAgentProvider
  let toolExecutor: jest.Mocked<ToolExecutorService>

  beforeEach(() => {
    calls = 0
    responses = []
    toolExecutor = { execute: jest.fn() } as any
    provider = new AnthropicAgentProvider(toolExecutor, config)
  })

  const input = (message = 'hi') => ({ system: 'sys', turns: [], message, actorId: 'u1' })

  it('returns the text on a plain end_turn reply', async () => {
    responses = [{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here you go.' }] }]
    const res = await provider.run(input('what tasks?'))
    expect(res.text).toBe('Here you go.')
    expect(res.actions).toEqual([])
  })

  it('executes tool calls and loops until end_turn', async () => {
    responses = [
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 't1', name: 'search_knowledge_base', input: { query: 'x' } },
        ],
      },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'You have 3 tasks.' }] },
    ]
    toolExecutor.execute.mockResolvedValue({ results: [] })

    const res = await provider.run(input('my tasks'))

    expect(toolExecutor.execute).toHaveBeenCalledWith('search_knowledge_base', { query: 'x' }, 'u1')
    expect(res.text).toBe('You have 3 tasks.')
    expect(res.actions).toEqual([
      expect.objectContaining({ tool: 'search_knowledge_base', result: { results: [] } }),
    ])
  })

  it('falls back after max iterations', async () => {
    const toolUse = {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't', name: 'find_task', input: { query: 'x' } }],
    }
    responses = Array(12).fill(toolUse)
    toolExecutor.execute.mockResolvedValue({ tasks: [] })

    const res = await provider.run(input('loop forever'))

    expect(res.text).toMatch(/unable to complete/i)
  })
})
