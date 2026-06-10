import { ApiProperty } from '@nestjs/swagger'
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

// ─── Requests ────────────────────────────────────────────────────────────────

export class RoutineTimeInputDTO {
  @ApiProperty({ description: 'Horário de início no formato HH:mm', example: '08:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime deve estar no formato HH:mm' })
  startTime!: string

  @ApiProperty({ description: 'Horário de fim no formato HH:mm', example: '09:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'endTime deve estar no formato HH:mm' })
  endTime!: string
}

export class RoutinesRequestDTO {
  @ApiProperty({ description: 'Nome da rotina' })
  @IsString()
  @IsNotEmpty()
  title!: string

  @ApiProperty({ description: 'Descrição opcional', required: false })
  @IsString()
  @IsOptional()
  description?: string

  @ApiProperty({
    description: 'Blocos de tempo do dia com início e fim (HH:mm). startTime deve ser único por rotina.',
    type: [RoutineTimeInputDTO],
    example: [
      { startTime: '08:00', endTime: '08:30' },
      { startTime: '14:00', endTime: '14:15' },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutineTimeInputDTO)
  @IsNotEmpty()
  times!: RoutineTimeInputDTO[]

  @ApiProperty({
    description: 'Ativa ou pausa a rotina sem perder o histórico',
    default: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  active?: boolean

  @ApiProperty({
    description:
      'Dias da semana em que a rotina está ativa (0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb). ' +
      'Array vazio [] significa todos os dias.',
    type: [Number],
    example: [1, 2, 3, 4, 5],
    required: false,
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @IsOptional()
  days?: number[]
}

export class ToggleCompletionDTO {
  @ApiProperty({
    description: 'Data do dia a registrar a conclusão (YYYY-MM-DD)',
    example: '2026-06-09',
  })
  @IsDateString()
  date!: string
}

// ─── Responses ───────────────────────────────────────────────────────────────

export class RoutineTimeDTO {
  @ApiProperty() id: string
  @ApiProperty() startTime: string
  @ApiProperty() endTime: string
}

export class RoutineTimeWithCompletionsDTO extends RoutineTimeDTO {
  @ApiProperty({
    description: 'Datas (YYYY-MM-DD) em que este bloco foi concluído',
    type: [String],
  })
  completedDates: string[]
}

class RoutineBaseDTO {
  @ApiProperty() id: string
  @ApiProperty() title: string
  @ApiProperty({ nullable: true, required: false }) description?: string | null
  @ApiProperty() active: boolean
  @ApiProperty({
    type: [Number],
    description: 'Dias ativos (0=Dom…6=Sáb). [] = todos os dias.',
  })
  days: number[]
  @ApiProperty({ format: 'date-time' }) createdAt: Date
  @ApiProperty({ format: 'date-time' }) updatedAt: Date
}

export class RoutineItemListDTO extends RoutineBaseDTO {
  @ApiProperty({ type: [RoutineTimeDTO] }) times: RoutineTimeDTO[]
}

export class RoutineFullDTO extends RoutineBaseDTO {
  @ApiProperty({ type: [RoutineTimeWithCompletionsDTO] })
  times: RoutineTimeWithCompletionsDTO[]
}
