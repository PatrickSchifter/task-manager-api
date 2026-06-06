import { Module } from '@nestjs/common'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { CollaboratorsController } from './collaborators.controller'
import { CollaboratorsService } from './collaborators.service'

@Module({
  controllers: [CollaboratorsController],
  providers: [CollaboratorsService, RequestContextService],
  exports: [CollaboratorsService],
})
export class CollaboratorsModule {}
