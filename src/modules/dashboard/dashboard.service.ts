import { Injectable } from '@nestjs/common'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { DashboardSummaryDTO } from './dashboard.dto'

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  async getSummary(): Promise<DashboardSummaryDTO> {
    const userId = this.requestContext.getUserId()

    // Filtro base: projetos onde o usuário é criador ou colaborador
    const projectWhere = {
      OR: [{ createdById: userId }, { collaborators: { some: { userId } } }],
    }

    // ─── Queries em paralelo ─────────────────────────────────────────────────

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // Métricas contam apenas tarefas top-level (parentId IS NULL). Subtarefas são
    // unidades de trabalho internas e não entram nas contagens do dashboard.
    const [activeTasks, completedLast7Days, inProgress, recentProjects, upcomingTasks] =
      await Promise.all([
        // Tarefas ativas (TODO + IN_PROGRESS)
        this.prisma.task.count({
          where: {
            project: projectWhere,
            parentId: null,
            status: { in: ['TODO', 'IN_PROGRESS'] },
          },
        }),

        // Tarefas concluídas nos últimos 7 dias
        this.prisma.task.count({
          where: {
            project: projectWhere,
            parentId: null,
            status: 'DONE',
            updatedAt: { gte: sevenDaysAgo },
          },
        }),

        // Tarefas em progresso
        this.prisma.task.count({
          where: {
            project: projectWhere,
            parentId: null,
            status: 'IN_PROGRESS',
          },
        }),

        // Projetos recentes com contagem de tarefas (apenas top-level)
        this.prisma.project.findMany({
          where: projectWhere,
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            name: true,
            tasks: {
              where: { parentId: null },
              select: { status: true },
            },
          },
        }),

        // Próximas tarefas: não concluídas com dueDate, ordenadas por urgência
        this.prisma.task.findMany({
          where: {
            project: projectWhere,
            parentId: null,
            status: { not: 'DONE' },
            dueDate: { not: null },
          },
          orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
          take: 10,
          select: {
            id: true,
            title: true,
            dueDate: true,
            priority: true,
            status: true,
            project: { select: { name: true, id: true } },
          },
        }),
      ])

    // ─── Formatação ──────────────────────────────────────────────────────────

    return {
      stats: {
        activeTasks,
        completedLast7Days,
        inProgress,
      },
      recentProjects: recentProjects.map((p) => ({
        id: p.id,
        name: p.name,
        totalTasks: p.tasks.length,
        doneTasks: p.tasks.filter((t) => t.status === 'DONE').length,
      })),
      upcomingTasks: upcomingTasks.map((t) => ({
        id: t.id,
        title: t.title,
        project: t.project,
        dueDate: t.dueDate?.toISOString() ?? null,
        priority: t.priority,
        status: t.status,
      })),
    }
  }
}
