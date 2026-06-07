import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger'
import { memoryStorage } from 'multer'
import { AuthenticatedUser } from 'src/common/decorators/authenticated-user.decorator'
import { ValidateResourcesIds } from 'src/common/decorators/validate-resources-ids.decorator'
import { QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { ValidateResourcesIdsInterceptor } from 'src/common/interceptors/validate-resources-ids.interceptor'
import { ApiPaginatedResponse } from 'src/common/swagger/api-paginated-response'
import type { User } from 'src/generated/prisma/client'
import { MAX_DOCUMENT_SIZE_BYTES } from '../attachments/attachment.constants'
import { AddCommentDTO, CommentFullDTO, CommentItemListDTO, UpdateCommentDTO } from './comments.dto'
import { CommentsService } from './comments.service'

@Controller({
  version: '1',
  path: 'projects/:projectId/tasks/:taskId/comments',
})
@UseInterceptors(ValidateResourcesIdsInterceptor)
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class CommentsController {
  constructor(private readonly commentService: CommentsService) {}

  @Post()
  @ApiCreatedResponse({ type: CommentItemListDTO })
  @HttpCode(HttpStatus.CREATED)
  @ValidateResourcesIds()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['content'],
      properties: {
        content: { type: 'string', description: 'Comment text' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description:
            'Optional attachments — images (jpg, png, webp; max 5 MB) or documents (pdf, doc, docx, txt, csv, md; max 20 MB)',
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES },
    }),
  )
  create(
    @AuthenticatedUser() user: User,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() data: AddCommentDTO,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.commentService.create({
      actorId: user.id,
      data,
      taskId,
      files: files ?? [],
    })
  }

  @Get()
  @ValidateResourcesIds()
  @ApiPaginatedResponse(CommentItemListDTO)
  findAllByTaskId(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query() query?: QueryPaginationDTO,
  ) {
    return this.commentService.findByTaskId({ taskId, query })
  }

  @Get(':commentId')
  @ValidateResourcesIds()
  @ApiOkResponse({ type: CommentFullDTO })
  findById(@Param('commentId', ParseUUIDPipe) id: string) {
    return this.commentService.findById(id)
  }

  @Put(':commentId')
  @ValidateResourcesIds()
  @ApiOkResponse({ type: CommentItemListDTO })
  update(
    @AuthenticatedUser() user: User,
    @Param('commentId', ParseUUIDPipe) id: string,
    @Body() data: UpdateCommentDTO,
  ) {
    return this.commentService.update({ actorId: user.id, data, id })
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ValidateResourcesIds()
  @ApiNoContentResponse()
  delete(@AuthenticatedUser() user: User, @Param('commentId', ParseUUIDPipe) id: string) {
    return this.commentService.delete({ actorId: user.id, id })
  }
}
