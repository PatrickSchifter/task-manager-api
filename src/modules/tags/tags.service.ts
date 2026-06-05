import { Injectable } from '@nestjs/common'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { pickTagColor } from 'src/utils/tag-color'
import { CreateTagDTO, TagDTO } from './tags.dto'

const tagSelect = { id: true, name: true, color: true }

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  findAll(): Promise<TagDTO[]> {
    const ownerId = this.requestContext.getUserId()
    return this.prisma.tag.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' },
      select: tagSelect,
    })
  }

  create(data: CreateTagDTO): Promise<TagDTO> {
    const ownerId = this.requestContext.getUserId()
    return this.findOrCreate(ownerId, data.name, data.color)
  }

  async delete(id: string): Promise<void> {
    const ownerId = this.requestContext.getUserId()
    // deleteMany (em vez de delete) garante que só o dono apaga a própria tag,
    // sem vazar 404/500 sobre tags de outros usuários.
    await this.prisma.tag.deleteMany({ where: { id, ownerId } })
  }

  // Resolve uma lista de nomes para ids de Tag do dono, criando as que faltarem
  // (com cor auto-atribuída). Usado pelo fluxo de criação/edição de tasks.
  async resolveNames(ownerId: string, names: string[]): Promise<string[]> {
    const unique = Array.from(
      new Map(
        names
          .map((n) => n.trim())
          .filter(Boolean)
          .map((n) => [n.toLowerCase(), n]),
      ).values(),
    )

    const tags = await Promise.all(unique.map((name) => this.findOrCreate(ownerId, name)))
    return tags.map((t) => t.id)
  }

  // Find-or-create de uma tag do dono. `color` explícito (vindo do criador de
  // tags no front) é usado na criação; senão, cor auto pelo nome. Tags já
  // existentes são reusadas como estão (não troca a cor).
  private findOrCreate(ownerId: string, name: string, color?: string): Promise<TagDTO> {
    const trimmed = name.trim()
    return this.prisma.tag.upsert({
      where: { ownerId_name: { ownerId, name: trimmed } },
      update: {},
      create: { ownerId, name: trimmed, color: color ?? pickTagColor(trimmed) },
      select: tagSelect,
    })
  }
}
