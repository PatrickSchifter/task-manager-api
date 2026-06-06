export default () => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    env: process.env.NODE_ENV || 'development',
    url_base: process.env.URL_BASE,
    web_app_url_base: process.env.WEB_APP_URL_BASE,
  },
  rmq: {
    url: process.env.RABBITMQ_URL,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    agentModel: process.env.OPENAI_AGENT_MODEL ?? 'gpt-4o-mini',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
  },
  agent: {
    // primary provider for the chat agent: 'anthropic' | 'openai'
    // default 'openai' (gpt-4o-mini): validated reliable for all CRUD actions at
    // ~1/20 the cost of Claude; flip to 'anthropic' for Sonnet if needed
    provider: process.env.AGENT_PROVIDER ?? 'openai',
    // when the primary is a cheap model, route collaborator-invite messages to the
    // Anthropic (Sonnet) provider, which is reliable for that action
    escalateInvites: process.env.AGENT_ESCALATE_INVITES === 'true',
  },
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
  },
})
