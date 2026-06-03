import { ValidationPipe, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { CHAT_QUEUE, EMAIL_QUEUE, EMBEDDING_QUEUE } from './consts'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const configService = app.get(ConfigService)

  app.enableCors({
    origin: true,
    credentials: true,
  })

  app.enableVersioning({ type: VersioningType.URI })

  const config = new DocumentBuilder()
    .setTitle('Task Manager API')
    .setDescription('Api developed to help tasks to be done.')
    .setVersion('1')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
      },
      'jwt',
    )
    .build()
  const documentFactory = () => SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api', app, documentFactory, { jsonDocumentUrl: 'api-json' })

  //Microservices
  const rmqUrl = configService.getOrThrow<string>('rmq.url')

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl],
      queue: EMAIL_QUEUE,
      queueOptions: {
        durable: true,
        noAck: true,
      },
    },
  })

  app.connectMicroservice({
    transport: Transport.RMQ,
    options: {
      urls: [configService.getOrThrow<string>('rmq.url')],
      queue: EMBEDDING_QUEUE,
      queueOptions: { durable: true },
      noAck: true,
    },
  })

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl],
      queue: CHAT_QUEUE,
      queueOptions: {
        durable: true,
        noAck: true,
      },
    },
  })

  await app.startAllMicroservices()

  //Validations
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  )

  const port = configService.getOrThrow<number>('app.port')
  await app.listen(port)
}
bootstrap()
