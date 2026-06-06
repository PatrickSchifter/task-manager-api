import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { MailModule } from '../mail/mail.module'
import { UsersService } from '../users/users.service'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { GoogleStrategy } from './google.strategy'
import { JwtStrategy } from './jwt.strategy'

@Module({
  providers: [AuthService, UsersService, JwtStrategy, GoogleStrategy, RequestContextService],
  controllers: [AuthController],
  imports: [
    PassportModule,
    ConfigModule,
    MailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
})
export class AuthModule {}
