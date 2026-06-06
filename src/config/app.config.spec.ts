import appConfig from './app.config'

describe('app.config', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  it('should return default values when env vars are not set', () => {
    delete process.env.PORT
    delete process.env.NODE_ENV
    delete process.env.RABBITMQ_URL
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_AGENT_MODEL
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_MODEL
    delete process.env.AGENT_PROVIDER
    delete process.env.AGENT_ESCALATE_INVITES
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    delete process.env.GOOGLE_CALLBACK_URL

    const config = appConfig()

    expect(config).toEqual({
      app: {
        port: 3000,
        env: 'development',
        url_base: undefined,
        web_app_url_base: undefined,
      },
      rmq: {
        url: undefined,
      },
      openai: {
        apiKey: undefined,
        agentModel: 'gpt-4o-mini',
      },
      anthropic: {
        apiKey: undefined,
        model: 'claude-sonnet-4-6',
      },
      agent: {
        provider: 'openai',
        escalateInvites: false,
      },
      google: {
        clientID: undefined,
        clientSecret: undefined,
        callbackURL: undefined,
      },
    })
  })

  it('should return configured values when env vars are set', () => {
    process.env.PORT = '4000'
    process.env.NODE_ENV = 'production'
    process.env.URL_BASE = 'https://api.example.com'
    process.env.WEB_APP_URL_BASE = 'https://app.example.com'
    process.env.RABBITMQ_URL = 'amqp://localhost:5672'
    process.env.OPENAI_API_KEY = 'sk-test'
    process.env.OPENAI_AGENT_MODEL = 'gpt-4o-mini'
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-6'
    process.env.AGENT_PROVIDER = 'openai'
    process.env.AGENT_ESCALATE_INVITES = 'true'
    process.env.GOOGLE_CLIENT_ID = 'client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
    process.env.GOOGLE_CALLBACK_URL = 'https://api.example.com/v1/auth/google/callback'

    const config = appConfig()

    expect(config).toEqual({
      app: {
        port: 4000,
        env: 'production',
        url_base: 'https://api.example.com',
        web_app_url_base: 'https://app.example.com',
      },
      rmq: {
        url: 'amqp://localhost:5672',
      },
      openai: {
        apiKey: 'sk-test',
        agentModel: 'gpt-4o-mini',
      },
      anthropic: {
        apiKey: 'sk-ant-test',
        model: 'claude-sonnet-4-6',
      },
      agent: {
        provider: 'openai',
        escalateInvites: true,
      },
      google: {
        clientID: 'client-id',
        clientSecret: 'client-secret',
        callbackURL: 'https://api.example.com/v1/auth/google/callback',
      },
    })
  })
})
