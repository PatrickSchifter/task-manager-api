import { ApiProperty } from '@nestjs/swagger'
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { TaskPriority, TaskStatus } from 'src/generated/prisma/enums'

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
  assigneeId: string
}

class TaskBaseDTO {
  @ApiProperty() id: string
  @ApiProperty() title: string
  @ApiProperty({ nullable: true, required: false }) description?: string | null
  @ApiProperty({ enum: TaskStatus }) status: TaskStatus
  @ApiProperty({ enum: TaskPriority }) priority: TaskPriority
  @ApiProperty({ format: 'date-time', nullable: true, required: false }) dueDate?: Date | null
  @ApiProperty({ format: 'date-time' }) createdAt: Date
  @ApiProperty({ format: 'date-time' }) updatedAt: Date
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
}

export class TaskCommentDTO {
  @ApiProperty() id: string
  @ApiProperty() content: string
  @ApiProperty({ format: 'date-time' }) createdAt: Date
  @ApiProperty({ type: TaskCommentUserDTO }) author: TaskCommentUserDTO
}

export class TaskFullDTO extends TaskBaseDTO {
  @ApiProperty({ type: TaskAssineeDTO, nullable: true, required: false })
  assinee?: TaskAssineeDTO | null
  @ApiProperty({ type: [TaskCommentDTO] }) comments: TaskCommentDTO[]
}
