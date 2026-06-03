import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { CollaboratorRole } from 'src/generated/prisma/enums'

export class AddCollaboratorDTO {
  @ApiProperty({ description: 'User ID to add as collaborator' })
  @IsString()
  @IsNotEmpty()
  email: string

  @ApiProperty({
    description: 'Collaborator role',
    enum: CollaboratorRole,
    default: CollaboratorRole.EDITOR,
    required: false,
  })
  @IsEnum(CollaboratorRole)
  @IsOptional()
  role?: CollaboratorRole = CollaboratorRole.EDITOR
}

export class UpdateCollaboratorDTO {
  @ApiProperty({
    description: 'New collaborator role',
    enum: CollaboratorRole,
  })
  @IsEnum(CollaboratorRole)
  @IsNotEmpty()
  role: CollaboratorRole
}

class CollaboratorUserDTO {
  @ApiProperty() id: string
  @ApiProperty() name: string
  @ApiProperty() email: string
  @ApiProperty({ nullable: true }) avatar: string
}

export class CollaboratorItemListDTO {
  @ApiProperty() id: string
  @ApiProperty({ enum: CollaboratorRole }) role: CollaboratorRole
  @ApiProperty() projectId: string
  @ApiProperty() userId: string
  @ApiProperty({ format: 'date-time' }) createAt: string

  @ApiProperty({ type: CollaboratorUserDTO })
  user: CollaboratorUserDTO
}
