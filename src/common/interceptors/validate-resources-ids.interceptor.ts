import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { isUUID } from 'class-validator'
import { Observable } from 'rxjs'
import { VALIDATE_RESOURCES_IDS } from 'src/consts'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class ValidateResourcesIdsInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<Request>> {
    const shouldValidate = this.reflector.get<boolean>(VALIDATE_RESOURCES_IDS, context.getHandler())

    if (!shouldValidate) return next.handle()

    const request = context.switchToHttp().getRequest()
    const projectId = request.params.projectId
    const taskId = request.params.taskId
    const userId = request.params.userId
    const requesterId = request.user?.id

    if (projectId) {
      // Autorização de acesso ao projeto: além de existir, o projeto precisa
      // pertencer ao usuário autenticado (dono) ou tê-lo como colaborador.
      // Escopar a busca por acesso — e não só por existência — fecha um IDOR:
      // sem isso, qualquer usuário logado lê/edita/exclui tasks, comentários e o
      // próprio projeto de terceiros apenas conhecendo o id. Mesma regra de
      // acesso do ProjectsService. Retornamos 404 (e não 403) de propósito, para
      // não revelar a existência de projetos a quem não é membro.
      const project = await this.prisma.project.findFirst({
        where: {
          id: projectId,
          OR: [{ createdById: requesterId }, { collaborators: { some: { userId: requesterId } } }],
        },
      })
      if (!project) throw new NotFoundException('Project not found')
    }

    if (taskId) {
      const task = await this.prisma.task.findFirst({ where: { projectId, id: taskId } })
      if (!task) throw new NotFoundException('Task not found')
    }

    if (userId !== undefined) {
      // Rejeita userId ausente/malformado com 400 claro, em vez de cair na
      // busca de usuário e retornar um 404 "User not found." enganoso.
      if (!isUUID(userId))
        throw new BadRequestException('userId is required and must be a valid UUID')

      const user = await this.prisma.user.findFirst({ where: { id: userId } })

      if (!user) throw new NotFoundException('User not found.')
    }

    return next.handle()
  }
}
