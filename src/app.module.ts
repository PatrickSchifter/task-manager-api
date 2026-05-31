import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { CloudnaryService } from './common/services/cloudnary/cloudnary.service'
import { RequestContextService } from './common/services/request-context/request-context.service'
import appConfig from './config/app.config'
import { AuthModule } from './modules/auth/auth.module'
import { ChatModule } from './modules/chat/chat.module'
import { CollaboratorsModule } from './modules/collaborators/collaborators.module'
import { CommentsModule } from './modules/comments/comments.module'
import { MailModule } from './modules/mail/mail.module'
import { McpModule } from './modules/mcp/mcp.module'
import { ProjectsModule } from './modules/projects/projects.module'
import { RagModule } from './modules/rag/rag.module'
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
    UsersModule,
    CollaboratorsModule,
    CommentsModule,
    AuthModule,
    MailModule,
    McpModule,
    RagModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService, RequestContextService, CloudnaryService],
})
export class AppModule {}
