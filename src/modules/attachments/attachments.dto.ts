import { ApiProperty } from '@nestjs/swagger'

export class AttachmentItemDTO {
  @ApiProperty() id: string
  @ApiProperty() fileName: string
  @ApiProperty() mimeType: string
  @ApiProperty() size: number
  @ApiProperty() provider: string
  @ApiProperty() status: string
  @ApiProperty() taskId: string
  @ApiProperty({ nullable: true }) commentId: string | null
  @ApiProperty({ format: 'date-time' }) createdAt: string
}

export class AttachmentUrlDTO {
  @ApiProperty({
    description:
      'Temporary signed URL (60 s) for Supabase docs; permanent URL for Cloudinary images',
  })
  url: string
}
