import Anthropic from '@anthropic-ai/sdk'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TOOL_DEFINITIONS } from '../tool-definitions'
import { ToolExecutorService } from '../tool-executor.service'
import {
  type ActionRecord,
  type AgentProvider,
  type AgentRunInput,
  type AgentRunResult,
  MAX_AGENT_ITERATIONS,
} from './agent-provider'

@Injectable()
export class AnthropicAgentProvider implements AgentProvider {
  readonly name = 'anthropic'
  private readonly anthropic: Anthropic
  private readonly model: string
  private readonly logger = new Logger(AnthropicAgentProvider.name)

  constructor(
    private readonly toolExecutor: ToolExecutorService,
    config: ConfigService,
  ) {
    this.anthropic = new Anthropic({ apiKey: config.getOrThrow<string>('anthropic.apiKey') })
    this.model = config.getOrThrow<string>('anthropic.model')
  }

  async run({ system, turns, message, actorId, label }: AgentRunInput): Promise<AgentRunResult> {
    const messages: Anthropic.MessageParam[] = []
    for (const t of turns) messages.push({ role: t.role, content: t.content })
    messages.push({ role: 'user', content: message })

    const actions: ActionRecord[] = []

    for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4096,
        system,
        tools: TOOL_DEFINITIONS,
        // Prompt caching: marker auto-placed on the last block, so the whole prefix
        // (tools + system + prior turns) is one cache segment read at ~0.1x on
        // subsequent turns / rapid follow-ups (Sonnet floor 2K; Haiku floor 4K).
        cache_control: { type: 'ephemeral' },
        messages,
      })

      const u = response.usage
      if (u) {
        this.logger.debug(
          `[${label ?? '-'}] ${this.model} in=${u.input_tokens} out=${u.output_tokens} ` +
            `cacheWrite=${u.cache_creation_input_tokens ?? 0} cacheRead=${u.cache_read_input_tokens ?? 0}`,
        )
      }

      messages.push({ role: 'assistant', content: response.content })

      if (response.stop_reason !== 'tool_use') {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('')
        return { text, actions }
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue
        const result = await this.toolExecutor.execute(block.name, block.input, actorId)
        actions.push({ tool: block.name, input: block.input as Record<string, unknown>, result })
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        })
      }
      messages.push({ role: 'user', content: toolResults })
    }

    return {
      text: 'I was unable to complete the request within the allowed number of steps.',
      actions,
    }
  }
}
