// Provider-agnostic contract for the agentic chat loop. The tool catalog and the
// ToolExecutorService are shared across providers; only the model wire-format and
// the loop differ per provider (Anthropic vs OpenAI).

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface ActionRecord {
  tool: string
  input: Record<string, unknown>
  result: unknown
}

export interface AgentRunInput {
  system: string
  turns: ConversationTurn[] // prior conversation (chronological), text-only
  message: string // the current user message
  actorId: string // user the agent acts on behalf of
  label?: string // for logging (e.g. the chat message id)
}

export interface AgentRunResult {
  text: string
  actions: ActionRecord[]
}

export interface AgentProvider {
  readonly name: string
  run(input: AgentRunInput): Promise<AgentRunResult>
}

export const MAX_AGENT_ITERATIONS = 10
