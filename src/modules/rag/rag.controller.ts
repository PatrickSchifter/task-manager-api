import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { ChatRequestDTO, ChatResponseDTO } from './rag.dto'
import { RagService } from './rag.service'

@Controller({ path: 'rag', version: '1' })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat with your tasks using AI' })
  async chat(@Body() body: ChatRequestDTO): Promise<ChatResponseDTO> {
    const answer = await this.ragService.chat({
      message: body.message,
    })

    return { answer }
  }
}
