import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ClientProxy } from '@nestjs/microservices'
import * as fs from 'fs'
import * as handlebars from 'handlebars'
import * as path from 'path'
import { Resend } from 'resend'
import { EMAIL_SERVICE, SEND_PASSWORD_RESET } from 'src/consts'

@Injectable()
export class MailService {
  private resend: Resend

  constructor(
    @Inject(EMAIL_SERVICE) private client: ClientProxy,
    private configService: ConfigService,
  ) {
    const apiKey = this.configService.getOrThrow<string>('RESEND_API_KEY')
    this.resend = new Resend(apiKey)
  }

  private renderTemplate(templateName: string, data: any) {
    const filePath = path.join(process.cwd(), 'templates', `${templateName}.hbs`)

    const template = fs.readFileSync(filePath, 'utf-8')
    const compiled = handlebars.compile(template)

    return compiled(data)
  }

  async sendEmail(to: string, subject: string, html: string) {
    const from = this.configService.get<string>('EMAIL_FROM')

    if (!from) {
      throw new Error('EMAIL_FROM não configurado')
    }

    return this.resend.emails.send({
      from,
      to,
      subject,
      html,
    })
  }

  async sendPasswordRequest(email: string, token: string) {
    const web_app_url = this.configService.getOrThrow<string>('app.web_app_url_base')

    const url = `${web_app_url}/reset-password?token=${token}`
    this.client.emit(SEND_PASSWORD_RESET, { email, url })
  }

  async sendPasswordRequestDirect(email: string, url: string) {
    const html = this.renderTemplate('forgot-password', { url })

    return this.sendEmail(email, 'Redefinição de senha', html)
  }
}
