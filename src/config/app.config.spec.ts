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
      },
    })
  })
})
