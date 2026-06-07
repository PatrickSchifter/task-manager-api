import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import type { CaptionInput, CaptionProvider } from '../caption.provider'

@Injectable()
export class OpenAiCaptionProvider implements CaptionProvider {
  private readonly openai: OpenAI
  private readonly model: string

  constructor(config: ConfigService) {
    this.openai = new OpenAI({ apiKey: config.getOrThrow<string>('openai.apiKey') })
    this.model = config.get<string>('caption.openaiVisionModel') ?? 'gpt-4o-mini'
  }

  async describe({ imageUrl, imageBuffer, mimeType }: CaptionInput): Promise<string> {
    let url: string

    if (imageUrl) {
      url = imageUrl
    } else if (imageBuffer) {
      url = `data:${mimeType};base64,${imageBuffer.toString('base64')}`
    } else {
      throw new Error('CaptionProvider: imageUrl or imageBuffer required')
    }

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url } },
            {
              type: 'text',
              text: 'Extract all visible text from this image (OCR). Also describe the image content in detail. Output a comprehensive, structured description suitable for semantic search.',
            },
          ],
        },
      ],
      max_tokens: 1500,
    })

    return response.choices[0]?.message.content ?? ''
  }
}
