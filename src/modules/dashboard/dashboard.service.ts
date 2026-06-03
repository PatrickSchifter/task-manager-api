import { Injectable } from '@nestjs/common'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { TaskStatus } from 'src/generated/prisma/enums'
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

    const [activeTasks, completedLast7Days, inProgress, recentProjects, upcomingTasks] =
      await Promise.all([
        // Tarefas ativas (TODO + IN_PROGRESS)
        this.prisma.task.count({
          where: {
            project: projectWhere,
            status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
          },
        }),

        // Tarefas concluídas nos últimos 7 dias
        this.prisma.task.count({
          where: {
            project: projectWhere,
            status: TaskStatus.DONE,
            updatedAt: { gte: sevenDaysAgo },
          },
        }),

        // Tarefas em progresso
        this.prisma.task.count({
          where: {
            project: projectWhere,
            status: TaskStatus.IN_PROGRESS,
          },
        }),

        // Projetos recentes com contagem de tarefas
        this.prisma.project.findMany({
          where: projectWhere,
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            name: true,
            tasks: {
              select: { status: true },
            },
          },
        }),

        // Próximas tarefas: não concluídas com dueDate, ordenadas por urgência
        this.prisma.task.findMany({
          where: {
            project: projectWhere,
            status: { not: TaskStatus.DONE },
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
        doneTasks: p.tasks.filter((t) => t.status === TaskStatus.DONE).length,
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
