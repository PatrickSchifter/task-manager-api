import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator'

export class SignUpDTO {
  @ApiProperty({ description: 'User name' })
  @IsString()
  @IsNotEmpty()
  name: string

  @ApiProperty({ description: 'User email', uniqueItems: true })
  @IsNotEmpty()
  @IsEmail()
  email: string

  @ApiProperty({ description: 'User password', minLength: 6 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string
}

export class SignInDTO {
  @ApiProperty({ description: 'User email' })
  @IsNotEmpty()
  @IsEmail()
  email: string

  @ApiProperty({ description: 'User password' })
  @IsString()
  @IsNotEmpty()
  password: string
}

export class ForgotPasswordDTO {
  @ApiProperty({ description: 'User email' })
  @IsNotEmpty()
  @IsEmail()
  email: string
}

export class ResetPasswordDTO {
  @ApiProperty({ description: 'Reset Token' })
  @IsNotEmpty()
  token: string

  @ApiProperty({ description: 'New password', minLength: 6 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  newPassword: string
}
