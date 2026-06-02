import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const forwarded = req.headers?.['x-forwarded-for']
    const ip =
      (typeof forwarded === 'string' ? forwarded.split(',')[0] : null) ||
      req.socket?.remoteAddress ||
      req.ip ||
      'unknown'

    // body pode ser undefined se o guard rodar antes do body parser
    const email = (req.body?.email ?? '').toString().toLowerCase().trim()

    const tracker = `${ip}:${email || 'no-email'}`
    return tracker
  }
}
