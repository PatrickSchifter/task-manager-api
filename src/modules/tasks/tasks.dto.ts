import { ApiProperty } from '@nestjs/swagger'
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator'
import { TaskPriority, TaskStatus } from 'src/generated/prisma/enums'
import { TagDTO } from '../tags/tags.dto'

export class TasksRequestDTO {
  @ApiProperty({ description: 'Task title' })
  @IsString()
  @IsNotEmpty()
  title!: string

  @ApiProperty({ description: 'Task description' })
  @IsString()
  @IsOptional()
  description?: string

  @ApiProperty({
    description: 'Task status',
    enum: TaskStatus,
    default: TaskStatus.TODO,
    required: false,
  })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus

  @ApiProperty({
    description: 'Task priority',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
    required: false,
  })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority

  @ApiProperty({ description: 'Task due date' })
  @IsDateString()
  @IsOptional()
  dueDate?: string

  @ApiProperty({ description: 'Assinee User Id', required: false })
  @IsString()
  @IsOptional()
  assigneeId?: string

  @ApiProperty({
    description:
      'Tag names to attach to the task. Existing tags (by name, for the current user) are reused; unknown names are created automatically with an auto-assigned color. Omit to leave tags unchanged on update.',
    type: [String],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[]

  @ApiProperty({
    description:
      'Target index (0-based) within the status column. Ignored on create (a new task always goes to the top). On update, moves the task to this position; the server computes the fractional `order` key.',
    minimum: 0,
    required: false,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  position?: number

  @ApiProperty({
    description:
      'Id da tarefa-pai. Quando informado, esta task é criada como subtarefa. ' +
      'Regra de 1 nível: a tarefa-pai não pode ser, ela mesma, uma subtarefa. ' +
      'A subtarefa herda o projeto do pai. Omita para uma tarefa top-level.',
    type: String,
    required: false,
    nullable: true,
  })
  @IsUUID()
  @IsOptional()
  parentId?: string | null
}

class TaskBaseDTO {
  @ApiProperty() id: string
  @ApiProperty() title: string
  @ApiProperty({ nullable: true, required: false }) description?: string | null
  @ApiProperty({ enum: TaskStatus }) status: TaskStatus
  @ApiProperty({ enum: TaskPriority }) priority: TaskPriority
  @ApiProperty({ description: 'Fractional index key for ordering within the status column' })
  order: string
  @ApiProperty({
    description: 'Id da tarefa-pai (null para tarefas top-level).',
    type: String,
    nullable: true,
    required: false,
  })
  parentId?: string | null
  @ApiProperty({ format: 'date-time', nullable: true, required: false }) dueDate?: Date | null
  @ApiProperty({ type: [TagDTO] }) tags: TagDTO[]
  @ApiProperty({ format: 'date-time' }) createdAt: Date
  @ApiProperty({ format: 'date-time' }) updatedAt: Date
}

// Contador de progresso das subtarefas de uma tarefa-pai (ex.: "3/5").
export class SubtaskProgressDTO {
  @ApiProperty({ description: 'Subtarefas com status DONE' }) done: number
  @ApiProperty({ description: 'Total de subtarefas' }) total: number
}

export class TaskAssineeDTO {
  @ApiProperty() id: string
  @ApiProperty() name: string
  @ApiProperty() email: string
  @ApiProperty({ nullable: true, required: false }) avatar?: string | null
}

export class TaskCommentUserDTO extends TaskAssineeDTO {}

export class TaskItemListDTO extends TaskBaseDTO {
  @ApiProperty({ type: TaskAssineeDTO, nullable: true, required: false })
  assignee?: TaskAssineeDTO | null

  @ApiProperty({
    type: SubtaskProgressDTO,
    required: false,
    description:
      'Progresso das subtarefas. Presente apenas em tarefas top-level; ' +
      'ausente/omitido para subtarefas (que não têm filhas).',
  })
  subtaskProgress?: SubtaskProgressDTO
}

export class TaskCommentDTO {
  @ApiProperty() id: string
  @ApiProperty() content: string
  @ApiProperty({ format: 'date-time' }) createdAt: Date
  @ApiProperty({ type: TaskCommentUserDTO }) author: TaskCommentUserDTO
}

export class TaskFullDTO extends TaskBaseDTO {
  @ApiProperty({ type: TaskAssineeDTO, nullable: true, required: false })
  assignee?: TaskAssineeDTO | null
  @ApiProperty({ type: [TaskCommentDTO] }) comments: TaskCommentDTO[]

  @ApiProperty({
    type: [TaskItemListDTO],
    description: 'Subtarefas desta tarefa, ordenadas por `order`. Vazio para subtarefas.',
  })
  subtasks: TaskItemListDTO[]

  @ApiProperty({
    type: SubtaskProgressDTO,
    required: false,
    description: 'Progresso das subtarefas (done/total). Ausente para subtarefas.',
  })
  subtaskProgress?: SubtaskProgressDTO
}
