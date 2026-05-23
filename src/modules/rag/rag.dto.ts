import { ApiProperty } from '@nestjs/swagger'
import { IsString, MinLength } from 'class-validator'

export class ChatRequestDTO {
  @ApiProperty({ example: 'What are my high priority tasks?' })
  @IsString()
  @MinLength(3)
  message: string
}

export class ChatResponseDTO {
  @ApiProperty()
  answer: string
}
