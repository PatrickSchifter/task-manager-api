import { ApiProperty } from '@nestjs/swagger'
import { TaskPriority } from 'src/generated/prisma/enums'

// ─── Stats ────────────────────────────────────────────────────────────────────

export class DashboardStatsDTO {
  @ApiProperty({ description: 'Tasks with status TODO or IN_PROGRESS' })
  activeTasks: number

  @ApiProperty({ description: 'Tasks completed (DONE) in the last 7 days' })
  completedLast7Days: number

  @ApiProperty({ description: 'Tasks with status IN_PROGRESS' })
  inProgress: number
}

// ─── Recent Projects ──────────────────────────────────────────────────────────

export class DashboardProjectDTO {
  @ApiProperty() id: string
  @ApiProperty() name: string
}

export class DashboardProjectTotalAndDoneDTO extends DashboardProjectDTO {
  @ApiProperty() totalTasks: number
  @ApiProperty() doneTasks: number
}

// ─── Upcoming Tasks ───────────────────────────────────────────────────────────

export class DashboardTaskDTO {
  @ApiProperty() id: string
  @ApiProperty() title: string
  @ApiProperty() project: DashboardProjectDTO
  @ApiProperty({ format: 'date-time', nullable: true }) dueDate: string | null
  @ApiProperty({ enum: TaskPriority }) priority: TaskPriority
  @ApiProperty() status: string
}

// ─── Response ─────────────────────────────────────────────────────────────────

export class DashboardSummaryDTO {
  @ApiProperty({ type: DashboardStatsDTO })
  stats: DashboardStatsDTO

  @ApiProperty({ type: [DashboardProjectTotalAndDoneDTO] })
  recentProjects: DashboardProjectTotalAndDoneDTO[]

  @ApiProperty({ type: [DashboardTaskDTO] })
  upcomingTasks: DashboardTaskDTO[]
}
