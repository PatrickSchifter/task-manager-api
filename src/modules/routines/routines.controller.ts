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
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger'
import { AuthenticatedUser } from 'src/common/decorators/authenticated-user.decorator'
import { QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { ApiPaginatedResponse } from 'src/common/swagger/api-paginated-response'
import type { User } from 'src/generated/prisma/client'
import {
  RoutineFullDTO,
  RoutineItemListDTO,
  RoutinesRequestDTO,
  ToggleCompletionDTO,
} from './routines.dto'
import { RoutinesService } from './routines.service'

@Controller({ version: '1', path: 'routines' })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class RoutinesController {
  constructor(private readonly routinesService: RoutinesService) {}

  @Get()
  @ApiPaginatedResponse(RoutineItemListDTO)
  findAll(@AuthenticatedUser() user: User, @Query() query?: QueryPaginationDTO) {
    return this.routinesService.findAll({ ownerId: user.id, query })
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: RoutineItemListDTO })
  create(@AuthenticatedUser() user: User, @Body() data: RoutinesRequestDTO) {
    return this.routinesService.create({ ownerId: user.id, data })
  }

  @Get(':routineId')
  @ApiOkResponse({ type: RoutineFullDTO })
  findById(@AuthenticatedUser() user: User, @Param('routineId', ParseUUIDPipe) routineId: string) {
    return this.routinesService.findById({ id: routineId, ownerId: user.id })
  }

  @Put(':routineId')
  @ApiOkResponse({ type: RoutineItemListDTO })
  update(
    @AuthenticatedUser() user: User,
    @Param('routineId', ParseUUIDPipe) routineId: string,
    @Body() data: RoutinesRequestDTO,
  ) {
    return this.routinesService.update({ id: routineId, ownerId: user.id, data })
  }

  @Delete(':routineId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(@AuthenticatedUser() user: User, @Param('routineId', ParseUUIDPipe) routineId: string) {
    return this.routinesService.delete({ id: routineId, ownerId: user.id })
  }

  // Marca ou desmarca a conclusão de um horário específico num dado dia.
  // POST = toggle: se já existe, remove; se não, cria.
  @Post(':routineId/times/:timeId/toggle-completion')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        completed: { type: 'boolean' },
        date: { type: 'string', format: 'date' },
      },
    },
  })
  toggleCompletion(
    @AuthenticatedUser() user: User,
    @Param('routineId', ParseUUIDPipe) routineId: string,
    @Param('timeId', ParseUUIDPipe) timeId: string,
    @Body() data: ToggleCompletionDTO,
  ) {
    return this.routinesService.toggleCompletion({
      routineId,
      timeId,
      ownerId: user.id,
      data,
    })
  }
}
