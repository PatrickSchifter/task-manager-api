import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'
import { CollaboratorRole, TaskPriority, TaskStatus } from 'src/generated/prisma/enums'
import { CollaboratorItemListDTO } from '../collaborators/collaborator.dto'
import { TaskAssineeDTO, TaskCommentDTO } from '../tasks/tasks.dto'

export class ProjectDTO {
  @ApiProperty({ description: 'Project name' })
  @IsString()
  @IsNotEmpty()
  name: string

  @ApiProperty({ description: 'Project description', required: false })
  @IsString()
  description: string
}

export class ProjectTaskDTO {
  @ApiProperty() id: string
  @ApiProperty() title: string
  @ApiProperty({ nullable: true }) description: string
  @ApiProperty({ enum: TaskStatus, default: TaskStatus.TODO }) status: TaskStatus
  @ApiProperty({ enum: TaskPriority, default: TaskPriority.MEDIUM }) priority: TaskPriority
  @ApiProperty({ description: 'Fractional index key for ordering within the status column' })
  order: string
  @ApiProperty({ format: 'date-time' }) dueDate: string
  @ApiProperty({ format: 'date-time' }) createdAt: string
  @ApiProperty({ format: 'date-time' }) updatedAt: string
  @ApiProperty({ type: [TaskCommentDTO] }) comments: TaskCommentDTO[]
  @ApiProperty({ type: TaskAssineeDTO, nullable: true, required: false })
  assignee?: TaskAssineeDTO | null
}

export class ProjectItemListDTO {
  @ApiProperty() id: string
  @ApiProperty() name: string
  @ApiProperty() description: string
  @ApiProperty({ format: 'date-time' }) createdAt: string
  @ApiProperty({ format: 'date-time' }) updatedAt: string
  @ApiProperty({
    enum: CollaboratorRole,
    description: 'Role of the current user within the project',
  })
  role: CollaboratorRole
  @ApiProperty({ description: 'Number of members (collaborators) in the project' })
  membersCount: number
}

export class ProjectFullDTO extends ProjectItemListDTO {
  @ApiProperty({ type: [ProjectTaskDTO] }) tasks: ProjectTaskDTO[]
  @ApiProperty({ type: [CollaboratorItemListDTO] }) collaborators: CollaboratorItemListDTO[]
}
