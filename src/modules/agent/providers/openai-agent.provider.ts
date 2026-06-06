import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import { TOOL_DEFINITIONS } from '../tool-definitions'
import { ToolExecutorService } from '../tool-executor.service'
import {
  type ActionRecord,
  type AgentProvider,
  type AgentRunInput,
  type AgentRunResult,
  MAX_AGENT_ITERATIONS,
} from './agent-provider'

// Translate the shared (Anthropic-shaped) tool catalog to OpenAI's function-tool
// format. Same JSON Schema, different wrapper.
const OPENAI_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = TOOL_DEFINITIONS.map((t) => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema as Record<string, unknown>,
  },
}))

@Injectable()
export class OpenAiAgentProvider implements AgentProvider {
  readonly name = 'openai'
  private readonly openai: OpenAI
  private readonly model: string
  private readonly logger = new Logger(OpenAiAgentProvider.name)

  constructor(
    private readonly toolExecutor: ToolExecutorService,
    config: ConfigService,
  ) {
    this.openai = new OpenAI({ apiKey: config.getOrThrow<string>('openai.apiKey') })
    this.model = config.getOrThrow<string>('openai.agentModel')
  }

  async run({ system, turns, message, actorId, label }: AgentRunInput): Promise<AgentRunResult> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
    ]
    for (const t of turns) messages.push({ role: t.role, content: t.content })
    messages.push({ role: 'user', content: message })

    const actions: ActionRecord[] = []

    for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        tools: OPENAI_TOOLS,
        tool_choice: 'auto',
      })

      const choice = response.choices[0]
      const msg = choice.message
      const u = response.usage
      if (u) {
        this.logger.debug(
          `[${label ?? '-'}] ${this.model} in=${u.prompt_tokens} out=${u.completion_tokens} ` +
            `cacheRead=${u.prompt_tokens_details?.cached_tokens ?? 0}`,
        )
      }

      const toolCalls = msg.tool_calls ?? []
      if (toolCalls.length === 0) {
        return { text: msg.content ?? '', actions }
      }

      // append the assistant turn carrying the tool calls
      messages.push({ role: 'assistant', content: msg.content, tool_calls: msg.tool_calls })

      for (const tc of toolCalls) {
        if (tc.type !== 'function') continue
        let input: Record<string, unknown> = {}
        try {
          input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}
        } catch {
          input = {}
        }
        const result = await this.toolExecutor.execute(tc.function.name, input, actorId)
        actions.push({ tool: tc.function.name, input, result })
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
      }
    }

    return {
      text: 'I was unable to complete the request within the allowed number of steps.',
      actions,
    }
  }
}
