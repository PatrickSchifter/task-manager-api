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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiResponse,
} from '@nestjs/swagger'
import { memoryStorage } from 'multer'
import { ValidateResourcesIds } from 'src/common/decorators/validate-resources-ids.decorator'
import { QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { ValidateResourcesIdsInterceptor } from 'src/common/interceptors/validate-resources-ids.interceptor'
import { CloudnaryService } from 'src/common/services/cloudnary/cloudnary.service'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { ApiPaginatedResponse } from 'src/common/swagger/api-paginated-response'
import { UpdateUsersDTO, UserFullDTO, UserItemListDTO, UsersDTO } from './users.dto'
import { UsersService } from './users.service'

@UseInterceptors(ValidateResourcesIdsInterceptor)
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly cloudnaryService: CloudnaryService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Get()
  @ApiPaginatedResponse(UserItemListDTO)
  findAll(@Query() query?: QueryPaginationDTO) {
    return this.usersService.findAll(query)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: UserItemListDTO })
  create(@Body() data: UsersDTO) {
    return this.usersService.create(data)
  }

  @Get(':userId')
  @ApiResponse({ type: UserFullDTO })
  @ValidateResourcesIds()
  async findById(@Param('userId', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findById(id)
    return user
  }

  @Put(':userId')
  @ApiResponse({ type: UserItemListDTO })
  @ValidateResourcesIds()
  async update(@Param('userId', ParseUUIDPipe) id: string, @Body() data: UpdateUsersDTO) {
    return this.usersService.update({ data, id })
  }

  @Delete(':userId')
  @ValidateResourcesIds()
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('userId', ParseUUIDPipe) id: string) {
    return this.usersService.delete(id)
  }

  /* istanbul ignore next */
  @Post('avatar')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User avatar uploaded sucessfully',
    type: UserItemListDTO,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid data',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ValidateResourcesIds()
  async uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    const user = this.requestContext.getUser()
    const response = await this.cloudnaryService.upload({ file, folder: 'avatars', name: user.id })

    await this.usersService.update({ data: { avatar: response.url }, id: user.id })

    return this.usersService.findById(user.id)
  }
}
