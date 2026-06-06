import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator'
import { MessageStatus } from 'src/generated/prisma/enums'

export class ChatMessageDTO {
  @ApiProperty({ description: 'Message content' })
  @IsString()
  @IsNotEmpty()
  message: string
}

export class ChatMessageResponseDTO {
  @ApiProperty() id: string
  @ApiProperty() userId: string
  @ApiProperty() content: string
  @ApiProperty({ nullable: true }) response: string | null
  @ApiProperty({ enum: MessageStatus }) status: MessageStatus
  @ApiProperty({ nullable: true }) filters: Record<string, unknown> | null
  @ApiProperty({
    nullable: true,
    description: 'Structured list of agent actions executed while processing this message',
  })
  actions: Record<string, unknown>[] | null
  @ApiProperty({ format: 'date-time' }) createdAt: string
  @ApiProperty({ format: 'date-time' }) updatedAt: string
}

export class WsTicketResponseDTO {
  @ApiProperty({ description: 'Short-lived ticket for the WebSocket handshake' })
  ticket: string

  @ApiProperty({ description: 'Ticket lifetime in seconds' })
  expiresIn: number
}

export class ChatMessagesQueryDTO {
  @ApiProperty({ description: 'Number of last messages to return', default: 20, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20
}
