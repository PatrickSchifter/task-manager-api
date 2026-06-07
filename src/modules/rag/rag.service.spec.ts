import { ClientProxy } from '@nestjs/microservices'
import { Test, TestingModule } from '@nestjs/testing'
import { EMBEDDING_SERVICE } from 'src/consts'
import { RagService } from './rag.service'

describe('RagService', () => {
  let service: RagService
  let embeddingClient: jest.Mocked<ClientProxy>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        {
          provide: EMBEDDING_SERVICE,
          useValue: {
            emit: jest.fn().mockReturnValue({ subscribe: jest.fn() }),
          },
        },
      ],
    }).compile()

    service = module.get<RagService>(RagService)
    embeddingClient = module.get<ClientProxy>(EMBEDDING_SERVICE) as jest.Mocked<ClientProxy>

    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('dispatch methods', () => {
    it('should dispatch task embedding', () => {
      service.dispatchTaskEmbedding('task1')
      expect(embeddingClient.emit).toHaveBeenCalledWith('GENERATE_TASK_EMBEDDING', {
        taskId: 'task1',
      })
    })

    it('should dispatch comment embedding', () => {
      service.dispatchCommentEmbedding('comment1')
      expect(embeddingClient.emit).toHaveBeenCalledWith('GENERATE_COMMENT_EMBEDDING', {
        commentId: 'comment1',
      })
    })

    it('should dispatch project embedding', () => {
      service.dispatchProjectEmbedding('project1')
      expect(embeddingClient.emit).toHaveBeenCalledWith('GENERATE_PROJECT_EMBEDDING', {
        projectId: 'project1',
      })
    })

    it('should dispatch delete', () => {
      service.dispatchDelete('TASK', 'task1')
      expect(embeddingClient.emit).toHaveBeenCalledWith('DELETE_EMBEDDING', {
        sourceType: 'TASK',
        sourceId: 'task1',
      })
    })

    it('should dispatch project delete', () => {
      service.dispatchProjectDelete('project1')
      expect(embeddingClient.emit).toHaveBeenCalledWith('DELETE_EMBEDDING_BY_PROJECT', {
        projectId: 'project1',
      })
    })

    it('should dispatch task delete', () => {
      service.dispatchTaskDelete('task1')
      expect(embeddingClient.emit).toHaveBeenCalledWith('DELETE_TASK_EMBEDDING', {
        taskId: 'task1',
      })
    })

    it('should log error on dispatch failure', () => {
      ;(embeddingClient.emit as jest.Mock).mockReturnValue({
        subscribe: jest.fn().mockImplementation((callbacks: any) => {
          if (typeof callbacks === 'object' && callbacks?.error) {
            callbacks.error(new Error('Emit failed'))
          }
        }),
      })
      const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {})

      service.dispatchTaskEmbedding('task1')

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to dispatch GENERATE_TASK_EMBEDDING',
        expect.any(Error),
      )
    })
  })
})
