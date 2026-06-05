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
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { CreateTagDTO, TagDTO } from './tags.dto'
import { TagsService } from './tags.service'

@Controller({ version: '1', path: 'tags' })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  @ApiOkResponse({ type: [TagDTO] })
  findAll() {
    return this.tagsService.findAll()
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: TagDTO })
  create(@Body() data: CreateTagDTO) {
    return this.tagsService.create(data)
  }

  @Delete(':tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(@Param('tagId', ParseUUIDPipe) tagId: string) {
    return this.tagsService.delete(tagId)
  }
}
