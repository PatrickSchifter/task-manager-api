jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    url: jest.fn().mockReturnValue('https://res.cloudinary.com/test/image/upload/v1/avatars/user1'),
    uploader: {
      upload_stream: jest.fn(),
    },
  },
}))

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CloudnaryService } from './cloudnary.service';
import { Writable } from 'stream';

describe('CloudnaryService', () => {
  let service: CloudnaryService
  let cloudinaryMock: any

  beforeEach(async () => {
    cloudinaryMock = require('cloudinary').v2
    cloudinaryMock.uploader.upload_stream.mockReset()
    cloudinaryMock.config.mockClear()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudnaryService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockImplementation((key: string) => {
              if (key === 'CLOUDNARY_CLOUD_NAME') return 'test-cloud'
              if (key === 'CLOUDNARY_API_KEY') return 'test-key'
              if (key === 'CLOUDNARY_API_SECRET') return 'test-secret'
              return ''
            }),
          },
        },
      ],
    }).compile()

    service = module.get<CloudnaryService>(CloudnaryService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('should configure cloudinary on construction', () => {
    expect(cloudinaryMock.config).toHaveBeenCalledWith({
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      api_secret: 'test-secret',
    })
  })

  describe('upload', () => {
    it('should upload a file and return the url', async () => {
      const file = { buffer: Buffer.from('test') } as Express.Multer.File

      const mockWritable = new Writable({
        write(_chunk, _encoding, callback) {
          callback()
        },
        final(_callback) {
          _callback()
        },
      })

      let capturedCallback: Function = undefined as any
      cloudinaryMock.uploader.upload_stream.mockImplementation(
        (_options: any, callback: any) => {
          capturedCallback = callback
          return mockWritable
        },
      )

      const uploadPromise = service.upload({ file, folder: 'avatars', name: 'user1' })

      capturedCallback(null, { public_id: 'user1', version: 123 })

      const result = await uploadPromise

      expect(cloudinaryMock.uploader.upload_stream).toHaveBeenCalledWith(
        { public_id: 'user1', folder: 'avatars' },
        expect.any(Function),
      )
      expect(result).toEqual({ url: 'https://res.cloudinary.com/test/image/upload/v1/avatars/user1' })
    })
  })
})
