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
import { ApiBearerAuth, ApiCreatedResponse, ApiResponse } from '@nestjs/swagger'
import { AuthenticatedUser } from 'src/common/decorators/authenticated-user.decorator'
import { ValidateResourcesIds } from 'src/common/decorators/validate-resources-ids.decorator'
import { QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { ValidateResourcesIdsInterceptor } from 'src/common/interceptors/validate-resources-ids.interceptor'
import { ApiPaginatedResponse } from 'src/common/swagger/api-paginated-response'
import type { User } from 'src/generated/prisma/client'
import { ProjectDTO, ProjectFullDTO, ProjectItemListDTO } from './projects.dto'
import { ProjectsService } from './projects.service'

@Controller({ path: 'projects', version: '1' })
@UseInterceptors(ValidateResourcesIdsInterceptor)
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class ProjectsController {
  constructor(private readonly projectService: ProjectsService) {}

  @Get()
  @ApiPaginatedResponse(ProjectItemListDTO)
  findAll(@AuthenticatedUser() user: User, @Query() query?: QueryPaginationDTO) {
    return this.projectService.findAll(user.id, query)
  }

  @Get(':projectId')
  @ApiResponse({ type: ProjectFullDTO })
  @ValidateResourcesIds()
  findById(@AuthenticatedUser() user: User, @Param('projectId', ParseUUIDPipe) id: string) {
    return this.projectService.findById(user.id, id)
  }

  @Post()
  @ApiCreatedResponse({ type: ProjectItemListDTO })
  @HttpCode(HttpStatus.CREATED)
  create(@AuthenticatedUser() user: User, @Body() data: ProjectDTO) {
    return this.projectService.create(user.id, data)
  }

  @Put(':projectId')
  @ApiResponse({ type: ProjectItemListDTO })
  @ValidateResourcesIds()
  update(
    @AuthenticatedUser() user: User,
    @Param('projectId', ParseUUIDPipe) id: string,
    @Body() data: ProjectDTO,
  ) {
    return this.projectService.update(user.id, id, data)
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ValidateResourcesIds()
  delete(@AuthenticatedUser() user: User, @Param('projectId', ParseUUIDPipe) id: string) {
    return this.projectService.delete(user.id, id)
  }
}
