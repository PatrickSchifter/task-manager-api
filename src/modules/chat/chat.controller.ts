// chat.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { ApiBearerAuth, ApiCreatedResponse, ApiResponse } from '@nestjs/swagger'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { ValidateResourcesIdsInterceptor } from 'src/common/interceptors/validate-resources-ids.interceptor'
import {
  ChatMessageDTO,
  ChatMessageResponseDTO,
  ChatMessagesQueryDTO,
  WsTicketResponseDTO,
} from './chat.dto'
import { ChatService } from './chat.service'

@Controller({ path: 'chat', version: '1' })
@UseInterceptors(ValidateResourcesIdsInterceptor)
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @ApiCreatedResponse({ type: ChatMessageResponseDTO })
  @HttpCode(HttpStatus.CREATED)
  enqueue(@Body() data: ChatMessageDTO) {
    return this.chatService.enqueue(data)
  }

  @Post('ws-ticket')
  @ApiCreatedResponse({ type: WsTicketResponseDTO })
  @HttpCode(HttpStatus.CREATED)
  createWsTicket() {
    return this.chatService.createWsTicket()
  }

  @Get(':messageId')
  @ApiResponse({ type: ChatMessageResponseDTO })
  findById(@Param('messageId', ParseUUIDPipe) id: string) {
    return this.chatService.findById(id)
  }

  @Get()
  @ApiResponse({ type: [ChatMessageResponseDTO] })
  findAll(@Query() query: ChatMessagesQueryDTO) {
    return this.chatService.findAll(query.limit ?? 20)
  }
}
