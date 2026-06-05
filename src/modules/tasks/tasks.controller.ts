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
import { ValidateResourcesIds } from 'src/common/decorators/validate-resources-ids.decorator'
import { QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { ValidateResourcesIdsInterceptor } from 'src/common/interceptors/validate-resources-ids.interceptor'
import { ApiPaginatedResponse } from 'src/common/swagger/api-paginated-response'
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
  create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() data: TasksRequestDTO) {
    return this.taskService.create({
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

  @Put(':taskId')
  // Reordenar tasks (drag-and-drop) dispara muitos updates em sequência,
  // por isso esta rota usa um limite bem maior que o global (10/min).
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOkResponse({ type: TaskItemListDTO })
  @ValidateResourcesIds()
  update(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: TasksRequestDTO,
  ) {
    return this.taskService.update({ data, id: taskId, projectId })
  }

  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ValidateResourcesIds()
  delete(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.taskService.delete({ id: taskId, projectId })
  }
}
