import { Controller } from '@nestjs/common'
import { EventPattern, Payload } from '@nestjs/microservices'
import { PROCESS_CHAT_MESSAGE } from 'src/consts'
import { AgentService } from './agent.service'

@Controller()
export class AgentConsumer {
  constructor(private readonly agentService: AgentService) {}

  @EventPattern(PROCESS_CHAT_MESSAGE)
  async handleProcessMessage(@Payload() data: { messageId: string }) {
    await this.agentService.processMessage({ messageId: data.messageId })
  }
}
