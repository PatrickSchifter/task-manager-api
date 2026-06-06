import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PaginatedResponseDTO, QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { Prisma, Role, User } from 'src/generated/prisma/client'
import { PrismaService } from 'src/prisma/prisma.service'
import { paginate, paginateOutput } from 'src/utils/pagination.utils'
import { UpdateUsersDTO } from './users.dto'

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({
      data: { ...data, role: Role.USER },
      omit: { password: true },
    })
  }

  findById(id: string) {
    return this.prisma.user.findFirst({
      where: { id },
      omit: { password: true },
      include: { createProjects: { select: { id: true, name: true, description: true } } },
    })
  }

  findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email },
    })
  }

  /**
   * Resolve (ou cria) o usuário a partir do perfil do Google.
   * - Acha por googleId → login direto.
   * - Acha pelo e-mail (conta criada por senha) → vincula o googleId.
   * - Não existe → cria conta sem senha.
   *
   * Vive aqui (e não no AuthService) porque o AuthService é request-scoped
   * via RequestContextService — e a GoogleStrategy que chama isto precisa ser
   * singleton para se registrar no Passport durante o boot.
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

    const byEmail = await this.findByEmail(email)
    if (byEmail) {
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId, avatar: byEmail.avatar ?? avatar },
      })
    }

    return this.create({ name, email, googleId, avatar })
  }

  async findAll(query?: QueryPaginationDTO): Promise<PaginatedResponseDTO<Omit<User, 'password'>>> {
    const { skip, take } = paginate(query)
    const users = await this.prisma.user.findMany({ omit: { password: true }, skip, take })
    const total = await this.prisma.user.count({})

    return paginateOutput({ data: users, total, query })
  }

  update({ data, id }: { id: string; data: UpdateUsersDTO }) {
    return this.prisma.user.update({ where: { id }, data, omit: { password: true } })
  }

  delete(id: string) {
    return this.prisma.user.delete({ where: { id }, omit: { password: true } })
  }
}
