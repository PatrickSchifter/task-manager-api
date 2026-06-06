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
  ApiResponse,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { AuthenticatedUser } from 'src/common/decorators/authenticated-user.decorator'
import { ValidateResourcesIds } from 'src/common/decorators/validate-resources-ids.decorator'
import { QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { ValidateResourcesIdsInterceptor } from 'src/common/interceptors/validate-resources-ids.interceptor'
import { ApiPaginatedResponse } from 'src/common/swagger/api-paginated-response'
import type { User } from 'src/generated/prisma/client'
import { TaskFullDTO, TaskItemListDTO, TasksRequestDTO } from '../tasks/tasks.dto'
import { TasksService } from './tasks.service'

@UseInterceptors(ValidateResourcesIdsInterceptor)
@Controller({
  version: '1',
  path: 'projects/:projectId/tasks',
})
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class TasksController {
  constructor(private readonly taskService: TasksService) {}

  @Get()
  @ApiPaginatedResponse(TaskItemListDTO)
  @ValidateResourcesIds()
  findAllByProjectId(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query?: QueryPaginationDTO,
  ) {
    return this.taskService.findAllByProjectId({ projectId, query })
  }

  @Post()
  @ApiCreatedResponse({ type: TaskItemListDTO })
  @HttpCode(HttpStatus.CREATED)
  @ValidateResourcesIds()
  create(
    @AuthenticatedUser() user: User,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: TasksRequestDTO,
  ) {
    return this.taskService.create({
      actorId: user.id,
      data,
      projectId,
    })
  }

  @Get(':taskId')
  @ApiResponse({ type: TaskFullDTO })
  @ValidateResourcesIds()
  findById(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.taskService.findById({ id: taskId, projectId })
  }

  @Get(':taskId/subtasks')
  @ApiOkResponse({ type: [TaskItemListDTO] })
  @ValidateResourcesIds()
  findSubtasks(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.taskService.findSubtasks({ taskId, projectId })
  }

  @Put(':taskId')
  // Reordenar tasks (drag-and-drop) no kanban dispara muitos updates em
  // sequência, por isso esta rota usa um limite bem maior que o global
  // (10/min). O tracker é por usuário (ver CustomThrottlerGuard), então este
  // limite é por usuário e não vaza entre usuários atrás do mesmo IP.
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @ApiOkResponse({ type: TaskItemListDTO })
  @ValidateResourcesIds()
  update(
    @AuthenticatedUser() user: User,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: TasksRequestDTO,
  ) {
    return this.taskService.update({ actorId: user.id, data, id: taskId, projectId })
  }

  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ValidateResourcesIds()
  delete(
    @AuthenticatedUser() user: User,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.taskService.delete({ actorId: user.id, id: taskId, projectId })
  }
}
