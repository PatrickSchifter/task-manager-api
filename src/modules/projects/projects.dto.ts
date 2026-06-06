import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator'
import { CollaboratorRole, TaskPriority } from 'src/generated/prisma/enums'
import { CollaboratorItemListDTO } from '../collaborators/collaborator.dto'
import { TagDTO } from '../tags/tags.dto'
import { SubtaskProgressDTO, TaskAssineeDTO, TaskCommentDTO } from '../tasks/tasks.dto'

export class CreateProjectStatusInputDTO {
  @ApiProperty({ required: false }) @IsOptional() @IsString() id?: string
  @ApiProperty() @IsString() @IsNotEmpty() name: string
  @ApiProperty() @IsString() @IsNotEmpty() value: string
}

export class ProjectDTO {
  @ApiProperty({ description: 'Project name' })
  @IsString()
  @IsNotEmpty()
  name: string

  @ApiProperty({ description: 'Project description', required: false })
  @IsOptional()
  @IsString()
  description: string

  @ApiProperty({ type: [CreateProjectStatusInputDTO], required: false })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateProjectStatusInputDTO)
  statuses?: CreateProjectStatusInputDTO[]
}

export class ProjectTaskDTO {
  @ApiProperty() id: string
  @ApiProperty() title: string
  @ApiProperty({ nullable: true }) description: string
  @ApiProperty() status: string
  @ApiProperty({ enum: TaskPriority, default: TaskPriority.MEDIUM }) priority: TaskPriority
  @ApiProperty({ description: 'Fractional index key for ordering within the status column' })
  order: string
  @ApiProperty({ format: 'date-time' }) dueDate: string
  @ApiProperty({ format: 'date-time' }) createdAt: string
  @ApiProperty({ format: 'date-time' }) updatedAt: string
  @ApiProperty({ type: [TaskCommentDTO] }) comments: TaskCommentDTO[]
  @ApiProperty({ type: [TagDTO] }) tags: TagDTO[]
  @ApiProperty({ type: TaskAssineeDTO, nullable: true, required: false })
  assignee?: TaskAssineeDTO | null
  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    description: 'Sempre null aqui: o board lista apenas tarefas top-level.',
  })
  parentId?: string | null
  @ApiProperty({
    type: SubtaskProgressDTO,
    description: 'Progresso das subtarefas (done/total) para o indicador "3/5" no card.',
  })
  subtaskProgress: SubtaskProgressDTO
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

export class ProjectStatusDTO {
  @ApiProperty() id: string
  @ApiProperty() name: string
  @ApiProperty() value: string
  @ApiProperty() order: number
}

export class ProjectFullDTO extends ProjectItemListDTO {
  @ApiProperty({ type: [ProjectTaskDTO] }) tasks: ProjectTaskDTO[]
  @ApiProperty({ type: [CollaboratorItemListDTO] }) collaborators: CollaboratorItemListDTO[]
  @ApiProperty({ type: [ProjectStatusDTO] }) statuses: ProjectStatusDTO[]
}
