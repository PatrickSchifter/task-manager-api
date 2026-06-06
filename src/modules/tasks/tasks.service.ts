import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { projectAccessWhere } from 'src/common/authorization/project-access'
import { PaginatedResponseDTO, QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { TaskStatus } from 'src/generated/prisma/enums'
import { PrismaService } from 'src/prisma/prisma.service'
import { generateKeyBetween } from 'src/utils/fractional-indexing'
import { paginate, paginateOutput } from 'src/utils/pagination.utils'
import { RagService } from '../rag/rag.service'
import { TagsService } from '../tags/tags.service'
import { TaskItemListDTO, TasksRequestDTO } from './tasks.dto'

// Seleção das tags vinculadas a uma task. As linhas do join (`TaskTag`) trazem
// o objeto `tag` aninhado; `flattenTags` achata para `tags: TagDTO[]`.
const tagsSelect = {
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
}

const taskInclude = {
  assignee: { select: { id: true, name: true, email: true, avatar: true } },
  ...tagsSelect,
}

const assigneeSelect = {
  assignee: { select: { id: true, name: true, email: true, avatar: true } },
}

// Campos de um item de lista (Kanban / lista de subtarefas). Sem o relacionamento
// `subtasks` aninhado — quem precisa do progresso adiciona `subtaskStatusSelect`.
const listItemSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  order: true,
  parentId: true,
  dueDate: true,
  ...assigneeSelect,
  ...tagsSelect,
  createdAt: true,
  updatedAt: true,
} as const

// Traz só o status das subtarefas, o suficiente para calcular o progresso "3/5".
const subtaskStatusSelect = {
  subtasks: { select: { status: true } },
}

type TaskTagRow = { tag: { id: string; name: string; color: string } }

function flattenTags<T extends { tags: TaskTagRow[] }>(task: T) {
  return { ...task, tags: task.tags.map((t) => t.tag) }
}

// Calcula { done, total } a partir das subtarefas (só status).
function subtaskProgress(subtasks: { status: TaskStatus }[]) {
  return {
    done: subtasks.filter((s) => s.status === TaskStatus.DONE).length,
    total: subtasks.length,
  }
}

// Mapeia um item de lista que traz `subtasks: {status}[]`: achata tags e troca o
// array de subtarefas pelo contador `subtaskProgress`.
function toListItemWithProgress<
  T extends { tags: TaskTagRow[]; subtasks: { status: TaskStatus }[] },
>(task: T) {
  const { subtasks, tags, ...rest } = task
  return {
    ...rest,
    tags: tags.map((t) => t.tag),
    subtaskProgress: subtaskProgress(subtasks),
  }
}

const parseDueDate = (value?: string): Date | undefined => {
  if (!value) return undefined
  const datePart = value.split('T')[0]
  const parsed = new Date(`${datePart}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
    private readonly tagsService: TagsService,
  ) {}

  // Autoriza o ator (dono ou colaborador) a operar sobre o projeto. No HTTP o
  // ValidateResourcesIdsInterceptor já fez esse check; chamado de novo aqui, o
  // service fica seguro para ser invocado fora da request (consumer da fila).
  private async assertProjectAccess(actorId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ...projectAccessWhere(actorId) },
      select: { id: true },
    })
    if (!project) throw new NotFoundException('Project not found')
  }

  async create({
    actorId,
    data,
    projectId,
  }: {
    actorId: string
    data: TasksRequestDTO
    projectId: string
  }) {
    await this.assertProjectAccess(actorId, projectId)
    // Uma nova task sempre entra no topo da sua coluna: gera uma chave fracionária
    // anterior à do primeiro item da coluna. `position` do payload é ignorado aqui.
    const { position: _ignoredPosition, tags: tagNames, parentId, ...rest } = data
    const status = data.status ?? TaskStatus.TODO

    // Regra de 1 nível: se há parentId, o pai precisa existir no mesmo projeto e
    // não pode ser ele mesmo uma subtarefa.
    if (parentId) await this.assertValidParent(parentId, projectId)

    // Ordenação fracionária escopada por (projectId, status, parentId): subtarefas
    // de um pai têm seu próprio espaço de chaves, separado das tarefas top-level.
    const first = await this.prisma.task.findFirst({
      where: { projectId, status, parentId: parentId ?? null },
      orderBy: { order: 'asc' },
      select: { order: true },
    })
    const order = generateKeyBetween(null, first?.order ?? null)

    const task = await this.prisma.task.create({
      data: {
        ...rest,
        status,
        order,
        parentId: parentId ?? null,
        dueDate: parseDueDate(data.dueDate),
        projectId,
        ...(await this.buildTagsWrite(actorId, tagNames, { replace: false })),
      },
      include: taskInclude,
    })

    this.ragService.dispatchTaskEmbedding(task.id)
    // Subtarefa criada: o embedding do pai resume as subtarefas/progresso, então
    // reindexamos o pai para o RAG responder "o que falta na tarefa X?".
    if (parentId) this.ragService.dispatchTaskEmbedding(parentId)

    return flattenTags(task)
  }

  // Valida a regra de 1 nível para um parentId informado na criação de subtarefa.
  private async assertValidParent(parentId: string, projectId: string) {
    const parent = await this.prisma.task.findFirst({
      where: { id: parentId, projectId },
      select: { parentId: true },
    })
    if (!parent) throw new NotFoundException('Parent task not found')
    if (parent.parentId) {
      throw new BadRequestException(
        'Uma subtarefa não pode ter subtarefas (limite de 1 nível de aninhamento).',
      )
    }
  }

  async findAllByProjectId({
    projectId,
    query,
  }: {
    projectId: string
    query?: QueryPaginationDTO
  }): Promise<PaginatedResponseDTO<TaskItemListDTO>> {
    const { skip, take } = paginate(query)
    // Apenas tarefas top-level no Kanban: subtarefas (parentId != null) são
    // gerenciadas dentro da página de detalhe do pai, não como cards próprios.
    const where = { projectId, parentId: null }

    const tasks = await this.prisma.task.findMany({
      where,
      skip,
      take,
      orderBy: [{ status: 'asc' }, { order: 'asc' }],
      select: {
        ...listItemSelect,
        // Status das subtarefas → indicador de progresso "3/5" no card.
        ...subtaskStatusSelect,
      },
    })
    const total = await this.prisma.task.count({ where })

    return paginateOutput({ data: tasks.map(toListItemWithProgress), total, query })
  }

  async findById({ id, projectId }: { id: string; projectId: string }) {
    const task = await this.prisma.task.findFirst({
      where: { id, projectId },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatar: true } },
        comments: {
          include: { author: { select: { id: true, name: true, email: true, avatar: true } } },
        },
        ...tagsSelect,
        // Subtarefas completas (ordenadas) para a seção de subtarefas do detalhe.
        subtasks: {
          orderBy: { order: 'asc' },
          select: { ...listItemSelect },
        },
      },
    })

    if (!task) return task

    const { subtasks, ...taskRest } = task
    return {
      ...flattenTags(taskRest),
      subtasks: subtasks.map(flattenTags),
      subtaskProgress: subtaskProgress(subtasks),
    }
  }

  // Lista as subtarefas de uma tarefa (ordenadas por `order`). A validação de
  // acesso (projeto + task) é feita pelo ValidateResourcesIdsInterceptor.
  async findSubtasks({ taskId, projectId }: { taskId: string; projectId: string }) {
    const subtasks = await this.prisma.task.findMany({
      where: { projectId, parentId: taskId },
      orderBy: { order: 'asc' },
      select: { ...listItemSelect },
    })
    return subtasks.map(flattenTags)
  }

  async update({
    actorId,
    id,
    data,
    projectId,
  }: {
    actorId: string
    id: string
    data: TasksRequestDTO
    projectId: string
  }) {
    await this.assertProjectAccess(actorId, projectId)
    // `parentId` é ignorado no update: reparentar não é suportado (o vínculo de
    // subtarefa é definido apenas na criação), o que mantém o invariante de 1 nível.
    const { position, tags: tagNames, parentId: _ignoredParentId, ...rest } = data
    const tagsWrite = await this.buildTagsWrite(actorId, tagNames, { replace: true })
    const baseData = { ...rest, dueDate: parseDueDate(data.dueDate), ...tagsWrite }

    const current = await this.prisma.task.findFirst({
      where: { id, projectId },
      select: { status: true, parentId: true },
    })
    if (!current) throw new NotFoundException('Task not found')

    const targetStatus = data.status ?? current.status
    const statusChanged = targetStatus !== current.status
    const positionProvided = position !== undefined

    // Após salvar, reindexa a própria task; se for subtarefa, também o pai (o
    // resumo de subtarefas/progresso do embedding do pai muda).
    const dispatchEmbeddings = (taskId: string) => {
      this.ragService.dispatchTaskEmbedding(taskId)
      if (current.parentId) this.ragService.dispatchTaskEmbedding(current.parentId)
    }

    // Nada que afete a ordenação mudou: um update simples basta.
    if (!statusChanged && !positionProvided) {
      const updated = await this.prisma.task.update({
        where: { id, projectId },
        data: baseData,
        include: taskInclude,
      })
      dispatchEmbeddings(updated.id)
      return flattenTags(updated)
    }

    // Com fractional indexing, reordenar é UMA escrita: basta calcular a chave
    // entre os vizinhos da posição alvo (na coluna de destino, sem a própria task).
    // Os irmãos são escopados pelo mesmo `parentId` da task (top-level ou do pai).
    const siblings = await this.prisma.task.findMany({
      where: { projectId, status: targetStatus, parentId: current.parentId, id: { not: id } },
      orderBy: { order: 'asc' },
      select: { order: true },
    })

    // Posição alvo: índice pedido, ou topo (0) quando só o status mudou.
    const idx = Math.max(0, Math.min(positionProvided ? (position as number) : 0, siblings.length))
    const prevKey = idx > 0 ? siblings[idx - 1].order : null
    const nextKey = idx < siblings.length ? siblings[idx].order : null
    const order = generateKeyBetween(prevKey, nextKey)

    const updated = await this.prisma.task.update({
      where: { id, projectId },
      data: { ...baseData, status: targetStatus, order },
      include: taskInclude,
    })

    dispatchEmbeddings(updated.id)
    return flattenTags(updated)
  }

  async delete({ actorId, id, projectId }: { actorId: string; id: string; projectId: string }) {
    await this.assertProjectAccess(actorId, projectId)
    // Busca a task no projeto + ids das subtarefas (para limpar embeddings, que
    // não são FK e portanto não são removidos pelo cascade do banco).
    const task = await this.prisma.task.findFirst({
      where: { id, projectId },
      select: { parentId: true, subtasks: { select: { id: true } } },
    })
    if (!task) throw new NotFoundException('Task not found')

    const subtaskIds = task.subtasks.map((s) => s.id)
    const allIds = [id, ...subtaskIds]

    // Comment não tem cascade no banco: remover comentários do pai + subtarefas
    // antes de deletar, senão o cascade da task esbarraria na FK dos comments.
    await this.prisma.comment.deleteMany({ where: { taskId: { in: allIds } } })
    // O cascade da auto-relação remove as subtarefas ao deletar a tarefa-pai.
    await this.prisma.task.delete({ where: { id, projectId } })

    // Limpa embeddings da task e de todas as subtarefas removidas.
    allIds.forEach((taskId) => this.ragService.dispatchTaskDelete(taskId))
    // Se era uma subtarefa, reindexa o pai (o progresso dele mudou).
    if (task.parentId) this.ragService.dispatchTaskEmbedding(task.parentId)
    return
  }

  // Monta o trecho de escrita aninhada das tags para create/update.
  // - undefined  → não mexe nas tags (omite a chave).
  // - []         → limpa todas as tags da task (apenas no update).
  // - [nomes...] → define o conjunto pelas tags resolvidas (cria as novas).
  // `replace` adiciona `deleteMany` (substituição) — só vale no update; no
  // create não existem vínculos anteriores.
  private async buildTagsWrite(
    actorId: string,
    tagNames: string[] | undefined,
    { replace }: { replace: boolean },
  ) {
    if (tagNames === undefined) return {}

    const tagIds = await this.tagsService.resolveNames(actorId, tagNames)

    return {
      tags: {
        ...(replace ? { deleteMany: {} } : {}),
        create: tagIds.map((tagId) => ({ tagId })),
      },
    }
  }
}
