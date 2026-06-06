import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiCreatedResponse } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { GoogleAuthGuard } from 'src/common/guards/google-auth/google-auth.guard'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import type { User } from 'src/generated/prisma/client'
import { UserItemListDTO } from '../users/users.dto'
import { ForgotPasswordDTO, ResetPasswordDTO, SignInDTO, SignUpDTO } from './auth.dto'
import { AuthService } from './auth.service'

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('signup')
  @ApiCreatedResponse({ type: UserItemListDTO })
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() data: SignUpDTO) {
    return this.authService.signup(data)
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  signin(@Body() data: SignInDTO) {
    return this.authService.signin(data)
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  forgotPassword(@Body() data: ForgotPasswordDTO) {
    return this.authService.forgotPassword(data.email)
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() data: ResetPasswordDTO) {
    return this.authService.resetPassword(data.token, data.newPassword)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe() {
    return this.authService.findMe()
  }

  // Inicia o fluxo OAuth: o guard redireciona para a tela de consentimento do Google.
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {}

  // Callback do Google: o usuário já foi resolvido pela GoogleStrategy.
  // Assina o JWT e redireciona para o front, que grava o cookie HttpOnly.
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as User
    const { token } = this.authService.signToken(user.id)
    const webAppUrl = this.config.getOrThrow<string>('app.web_app_url_base')

    return res.redirect(`${webAppUrl}/auth/google/callback?token=${token}`)
  }
}
