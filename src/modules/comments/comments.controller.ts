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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger'
import { AuthenticatedUser } from 'src/common/decorators/authenticated-user.decorator'
import { ValidateResourcesIds } from 'src/common/decorators/validate-resources-ids.decorator'
import { QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { ValidateResourcesIdsInterceptor } from 'src/common/interceptors/validate-resources-ids.interceptor'
import { ApiPaginatedResponse } from 'src/common/swagger/api-paginated-response'
import type { User } from 'src/generated/prisma/client'
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
  create(
    @AuthenticatedUser() user: User,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() data: AddCommentDTO,
  ) {
    return this.commentService.create({
      actorId: user.id,
      data,
      taskId,
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
