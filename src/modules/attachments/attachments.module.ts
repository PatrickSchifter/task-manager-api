import { Module } from '@nestjs/common'
import { CloudnaryService } from 'src/common/services/cloudnary/cloudnary.service'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { RagModule } from '../rag/rag.module'
import { StorageModule } from '../storage/storage.module'
import { AttachmentsController } from './attachments.controller'
import { AttachmentsService } from './attachments.service'

@Module({
  imports: [StorageModule, RagModule],
  providers: [AttachmentsService, CloudnaryService, RequestContextService],
  controllers: [AttachmentsController],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
