import { Injectable, NotImplementedException } from '@nestjs/common'
import type { CaptionInput, CaptionProvider } from '../caption.provider'

@Injectable()
export class AnthropicCaptionProvider implements CaptionProvider {
  async describe(_input: CaptionInput): Promise<string> {
    throw new NotImplementedException(
      'AnthropicCaptionProvider not yet implemented — set CAPTION_PROVIDER=openai',
    )
  }
}
