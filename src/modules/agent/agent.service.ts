import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from 'src/generated/prisma/client'
import { ChatService } from '../chat/chat.service'
import {
  type AgentProvider,
  type ActionRecord,
  type ConversationTurn,
} from './providers/agent-provider'
import { AnthropicAgentProvider } from './providers/anthropic-agent.provider'
import { OpenAiAgentProvider } from './providers/openai-agent.provider'

const AGENT_SYSTEM_PROMPT = `You are a project management assistant integrated with a task management system.

You can:
- Answer questions about projects, tasks, and comments (use search_knowledge_base)
- Find projects or tasks by name (use find_project_by_name, find_task)
- Create projects, tasks, and comments
- Invite collaborators to projects

Guidelines:
- For informational questions, use search_knowledge_base to find relevant data
- Report concisely what actions you performed in your final response
- If a tool returns an error field, explain it to the user and suggest alternatives
- Only operate on entities the user has access to (enforced by the system)

Critical rules for actions (create_project, create_task, add_comment, invite_collaborator):
- To perform ANY action you MUST call its tool in this turn. NEVER state that something was created, commented, or invited unless you actually called the tool AND received a successful result in THIS turn. Do not rely on the conversation history to assume an action already happened — if the user asks for it now, call the tool now.
- Resolve IDs before acting: create_task and invite_collaborator need a projectId (call find_project_by_name if you only have the name); add_comment needs a taskId (call find_task if you only have the name).
- After the tool returns, base your confirmation strictly on the tool result (e.g. the returned id). If no tool was called, you have not done anything — say so instead of claiming success.`

// Heuristic to detect a collaborator-invite intent (EN + PT) so it can be routed
// to a stronger model when the cheap primary model is unreliable for that action.
const INVITE_INTENT =
  /\b(invite|collaborat|convid|colabora|compartilh|add\s+\w+\s+(to|as)\b.*\b(editor|viewer|project|projeto))/i

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name)
  private readonly primary: AgentProvider
  private readonly escalateInvites: boolean

  constructor(
    private readonly chatService: ChatService,
    private readonly config: ConfigService,
    private readonly anthropicProvider: AnthropicAgentProvider,
    private readonly openaiProvider: OpenAiAgentProvider,
  ) {
    const providerName = this.config.get<string>('agent.provider') ?? 'anthropic'
    this.primary = providerName === 'openai' ? this.openaiProvider : this.anthropicProvider
    this.escalateInvites = this.config.get<boolean>('agent.escalateInvites') ?? false
  }

  // Picks the provider for a message: invite-intent messages escalate to the
  // Anthropic (Sonnet) provider when escalation is enabled; everything else uses
  // the configured primary provider.
  private pickProvider(message: string): AgentProvider {
    if (this.escalateInvites && this.primary.name !== 'anthropic' && INVITE_INTENT.test(message)) {
      return this.anthropicProvider
    }
    return this.primary
  }

  async processMessage({ messageId }: { messageId: string }): Promise<void> {
    const chatMessage = await this.chatService.findByIdInternal(messageId)

    if (!chatMessage) {
      this.logger.error(`ChatMessage ${messageId} not found`)
      return
    }

    try {
      const history = await this.chatService.findByUserId(chatMessage.userId, 6)
      const turns = this.buildTurns(history, messageId)

      await this.chatService.setProcessing(messageId, {})

      const provider = this.pickProvider(chatMessage.content)
      this.logger.debug(`[${messageId}] routed to provider=${provider.name}`)

      const { text, actions } = await provider.run({
        system: AGENT_SYSTEM_PROMPT,
        turns,
        message: chatMessage.content,
        actorId: chatMessage.userId,
        label: messageId,
      })

      await this.chatService.setDelivered(messageId, text, this.serializeActions(actions))
    } catch (err) {
      this.logger.error(`Failed to process message ${messageId}`, err)
      await this.chatService.setFailed(messageId)
    }
  }

  private serializeActions(actions: ActionRecord[]): Prisma.InputJsonValue | undefined {
    return actions.length ? (actions as unknown as Prisma.InputJsonValue) : undefined
  }

  private buildTurns(
    history: Awaited<ReturnType<ChatService['findByUserId']>>,
    currentMessageId: string,
  ): ConversationTurn[] {
    const turns: ConversationTurn[] = []
    // history is ordered desc; reverse to chronological asc for the context window
    const past = history.filter((m) => m.id !== currentMessageId && m.response !== null).reverse()
    for (const msg of past) {
      turns.push({ role: 'user', content: msg.content })
      turns.push({ role: 'assistant', content: msg.response! })
    }
    return turns
  }
}
