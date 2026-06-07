import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger'
import { AuthenticatedUser } from 'src/common/decorators/authenticated-user.decorator'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import type { User } from 'src/generated/prisma/client'
import { AttachmentUrlDTO } from './attachments.dto'
import { AttachmentsService } from './attachments.service'

@Controller({ version: '1', path: 'attachments' })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get(':attachmentId/url')
  @ApiOkResponse({ type: AttachmentUrlDTO })
  async getUrl(
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @AuthenticatedUser() user: User,
  ): Promise<AttachmentUrlDTO> {
    const url = await this.attachmentsService.getUrl(attachmentId, user.id)
    return { url }
  }
}
