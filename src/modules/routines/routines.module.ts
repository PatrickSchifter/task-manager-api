import { Module } from '@nestjs/common'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { RagModule } from 'src/modules/rag/rag.module'
import { RoutinesController } from './routines.controller'
import { RoutinesService } from './routines.service'

@Module({
  imports: [RagModule],
  controllers: [RoutinesController],
  providers: [RoutinesService, RequestContextService],
  exports: [RoutinesService],
})
export class RoutinesModule {}
