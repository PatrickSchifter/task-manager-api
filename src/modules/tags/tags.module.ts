import { Module } from '@nestjs/common'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { TagsController } from './tags.controller'
import { TagsService } from './tags.service'

@Module({
  controllers: [TagsController],
  providers: [TagsService, RequestContextService],
  exports: [TagsService],
})
export class TagsModule {}
