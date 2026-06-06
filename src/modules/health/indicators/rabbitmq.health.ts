import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus'
import * as amqp from 'amqplib'

@Injectable()
export class RabbitMQHealthIndicator extends HealthIndicator {
  constructor(private readonly config: ConfigService) {
    super()
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const url = this.config.getOrThrow<string>('rmq.url')
    try {
      const conn = await amqp.connect(url)
      await conn.close()
      return this.getStatus(key, true)
    } catch (error) {
      throw new HealthCheckError(
        'RabbitMQ check failed',
        this.getStatus(key, false, { message: (error as Error).message }),
      )
    }
  }
}
