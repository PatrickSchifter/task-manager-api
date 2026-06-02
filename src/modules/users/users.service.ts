import { Injectable } from '@nestjs/common'
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
