import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { CustomThrottlerGuard } from './common/guards/throttler/throttler.guard'
import { CloudnaryService } from './common/services/cloudnary/cloudnary.service'
import { RequestContextService } from './common/services/request-context/request-context.service'
import appConfig from './config/app.config'
import { AgentModule } from './modules/agent/agent.module'
import { AuthModule } from './modules/auth/auth.module'
import { ChatModule } from './modules/chat/chat.module'
import { CollaboratorsModule } from './modules/collaborators/collaborators.module'
import { CommentsModule } from './modules/comments/comments.module'
import { DashboardModule } from './modules/dashboard/dashboard.module'
import { MailModule } from './modules/mail/mail.module'
import { ProjectsModule } from './modules/projects/projects.module'
import { RagModule } from './modules/rag/rag.module'
import { TagsModule } from './modules/tags/tags.module'
import { TasksModule } from './modules/tasks/tasks.module'
import { UsersModule } from './modules/users/users.module'
import { PrismaModule } from './prisma/prisma.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    PrismaModule,
    ProjectsModule,
    TasksModule,
    TagsModule,
    UsersModule,
    CollaboratorsModule,
    CommentsModule,
    AuthModule,
    MailModule,
    AgentModule,
    RagModule,
    ChatModule,
    DashboardModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        // Limite global por usuário (ver CustomThrottlerGuard). 10/min era
        // baixo demais para uma SPA: navegar no kanban já dispara vários GETs
        // (lista de tasks, comentários, refetch) e estourava em segundos.
        // Rotas sensíveis têm override próprio (login: 3/min, update: 240/min).
        limit: 100,
      },
    ]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RequestContextService,
    CloudnaryService,
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
