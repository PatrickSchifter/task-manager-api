import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { User } from 'src/generated/prisma/client'
import { PrismaService } from 'src/prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import { UsersService } from '../users/users.service'
import { SignInDTO, SignUpDTO } from './auth.dto'

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  async signup(data: SignUpDTO) {
    const hash = await bcrypt.hash(data.password, 12)
    const userExists = await this.usersService.findByEmail(data.email)
    if (userExists) throw new ConflictException()

    const newUser = await this.usersService.create({ ...data, password: hash })

    return {
      token: this.jwtService.sign({
        sub: { id: newUser.id },
      }),
    }
  }

  async signin({ email, password }: SignInDTO) {
    const user = await this.usersService.findByEmail(email)

    // `user.password` pode ser null para contas criadas só via Google —
    // nesse caso o login por senha falha sem quebrar o bcrypt.compare.
    if (user?.password && (await bcrypt.compare(password, user.password)))
      return this.signToken(user.id)

    throw new UnauthorizedException()
  }

  signToken(userId: string) {
    return {
      token: this.jwtService.sign({ sub: userId }),
    }
  }

  /**
   * Resolve (ou cria) o usuário a partir do perfil do Google.
   * - Acha por googleId → login direto.
   * - Acha pelo e-mail (conta criada por senha) → vincula o googleId.
   * - Não existe → cria conta sem senha.
   */
  async validateGoogleUser({
    googleId,
    email,
    name,
    avatar,
  }: {
    googleId: string
    email?: string
    name: string
    avatar?: string
  }) {
    if (!email) throw new UnauthorizedException('Conta Google sem e-mail')

    const byGoogle = await this.prisma.user.findUnique({ where: { googleId } })
    if (byGoogle) return byGoogle

    const byEmail = await this.usersService.findByEmail(email)
    if (byEmail) {
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId, avatar: byEmail.avatar ?? avatar },
      })
    }

    return this.usersService.create({ name, email, googleId, avatar })
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email)

    if (!user) throw new NotFoundException('User not found')

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      purpose: 'password-reset',
    })

    await this.mailService.sendPasswordRequest(user.email, token)

    return { message: 'Password request mail send' }
  }

  async resetPassword(token: string, newPassword) {
    try {
      const payload = this.jwtService.verify(token)

      if (payload.purpose !== 'password-reset') throw new BadRequestException('Invalid token')

      const user = await this.usersService.findById(payload.sub)

      if (!user) throw new BadRequestException('Invalid token')

      const hash = await bcrypt.hash(newPassword, 12)

      return this.prisma.user.update({
        data: { password: hash },
        where: { id: user.id },
      })
    } catch (error) {
      console.error(error)
      throw new BadRequestException('Invalid or expired token')
    }
  }

  async findMe(): Promise<Omit<User, 'password'>> {
    const { avatar, createdAt, email, googleId, id, name, role, updatedAt } =
      this.requestContext.getUser()
    return { avatar, createdAt, email, googleId, id, name, role, updatedAt }
  }
}
