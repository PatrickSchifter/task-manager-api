import { Controller } from '@nestjs/common'
import { EventPattern, Payload } from '@nestjs/microservices'
import { PROCESS_CHAT_MESSAGE } from 'src/consts'
import { RagService } from './rag.service'

@Controller()
export class RagConsumer {
  constructor(private readonly ragService: RagService) {}

  @EventPattern(PROCESS_CHAT_MESSAGE)
  async handleProcessMessage(@Payload() data: { messageId: string }) {
    await this.ragService.processMessage({ messageId: data.messageId })
  }
}
