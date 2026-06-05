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

    // Em rotas autenticadas o rate limit deve ser por usuário, não por IP.
    // O ThrottlerGuard global roda antes do JwtAuthGuard, então `req.user`
    // ainda não existe aqui; extraímos o `sub` do bearer token diretamente.
    // Sem isso, todas as requisições autenticadas caem em `ip:no-email` e
    // usuários atrás do mesmo IP (NAT/proxy/abas) dividem o mesmo limite.
    const userId = this.extractUserId(req)
    if (userId) {
      return `user:${userId}`
    }

    // body pode ser undefined se o guard rodar antes do body parser
    const email = (req.body?.email ?? '').toString().toLowerCase().trim()

    return `${ip}:${email || 'no-email'}`
  }

  private extractUserId(req: Record<string, any>): string | null {
    const auth = req.headers?.authorization
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
      return null
    }

    const token = auth.slice(7).trim()
    const payload = token.split('.')[1]
    if (!payload) return null

    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      const sub = decoded?.sub
      return typeof sub === 'string' && sub.length > 0 ? sub : null
    } catch {
      return null
    }
  }
}
