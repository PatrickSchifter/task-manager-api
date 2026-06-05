import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { TAG_COLORS } from 'src/utils/tag-color'

export class CreateTagDTO {
  @ApiProperty({ description: 'Tag name (unique per user)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name!: string

  @ApiProperty({
    description: 'Color token. If omitted, a color is auto-assigned from the name.',
    enum: TAG_COLORS,
    required: false,
  })
  @IsOptional()
  @IsIn(TAG_COLORS as unknown as string[])
  color?: string
}

export class TagDTO {
  @ApiProperty() id: string
  @ApiProperty() name: string
  @ApiProperty({
    description: 'Color token: brand | emerald | amber | rose | violet | cyan | muted',
  })
  color: string
}
