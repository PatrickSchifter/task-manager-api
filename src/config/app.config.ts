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
  },
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
  },
})
