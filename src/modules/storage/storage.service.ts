import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

@Injectable()
export class StorageService {
  private readonly client: SupabaseClient
  private readonly bucket: string
  private readonly logger = new Logger(StorageService.name)

  constructor(config: ConfigService) {
    this.client = createClient(
      config.getOrThrow<string>('SUPABASE_URL'),
      config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    )
    this.bucket = config.getOrThrow<string>('SUPABASE_BUCKET')
  }

  async upload({
    buffer,
    path,
    contentType,
  }: {
    buffer: Buffer
    path: string
    contentType: string
  }): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(path, buffer, { contentType, upsert: false })
    if (error) throw new InternalServerErrorException(`Supabase upload failed: ${error.message}`)
  }

  async createSignedUrl(path: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresInSeconds)
    if (error || !data)
      throw new InternalServerErrorException(`Signed URL failed: ${error?.message}`)
    return data.signedUrl
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([path])
    if (error) this.logger.error(`Supabase remove failed for ${path}: ${error.message}`)
  }

  async download(path: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(path)
    if (error || !data)
      throw new InternalServerErrorException(`Supabase download failed: ${error?.message}`)
    return Buffer.from(await data.arrayBuffer())
  }
}
