import { Module } from '@nestjs/common'
import { ChatModule } from '../chat/chat.module'
import { CollaboratorsModule } from '../collaborators/collaborators.module'
import { CommentsModule } from '../comments/comments.module'
import { EmbeddingModule } from '../embedding/embedding.module'
import { ProjectsModule } from '../projects/projects.module'
import { TasksModule } from '../tasks/tasks.module'
import { AgentConsumer } from './agent.consumer'
import { AgentService } from './agent.service'
import { AnthropicAgentProvider } from './providers/anthropic-agent.provider'
import { OpenAiAgentProvider } from './providers/openai-agent.provider'
import { ToolExecutorService } from './tool-executor.service'

@Module({
  imports: [
    ChatModule,
    EmbeddingModule,
    ProjectsModule,
    TasksModule,
    CommentsModule,
    CollaboratorsModule,
  ],
  providers: [AgentService, ToolExecutorService, AnthropicAgentProvider, OpenAiAgentProvider],
  controllers: [AgentConsumer],
})
export class AgentModule {}
