export interface CaptionInput {
  imageUrl?: string
  imageBuffer?: Buffer
  mimeType: string
}

export interface CaptionProvider {
  describe(input: CaptionInput): Promise<string>
}

export const CAPTION_PROVIDER = 'CAPTION_PROVIDER'
