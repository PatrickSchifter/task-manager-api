import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CAPTION_PROVIDER } from './caption.provider'
import { AnthropicCaptionProvider } from './providers/anthropic-caption.provider'
import { OpenAiCaptionProvider } from './providers/openai-caption.provider'

@Module({
  providers: [
    OpenAiCaptionProvider,
    AnthropicCaptionProvider,
    {
      provide: CAPTION_PROVIDER,
      inject: [ConfigService, OpenAiCaptionProvider, AnthropicCaptionProvider],
      useFactory: (
        config: ConfigService,
        openai: OpenAiCaptionProvider,
        anthropic: AnthropicCaptionProvider,
      ) => {
        const provider = config.get<string>('caption.provider') ?? 'openai'
        return provider === 'anthropic' ? anthropic : openai
      },
    },
  ],
  exports: [CAPTION_PROVIDER],
})
export class CaptionModule {}
