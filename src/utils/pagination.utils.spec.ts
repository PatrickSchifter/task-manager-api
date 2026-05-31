import { NotFoundException } from '@nestjs/common'
import { paginate, paginateOutput } from './pagination.utils'

describe('pagination.utils', () => {
  describe('paginate', () => {
    it('should return default skip and take when no query', () => {
      const result = paginate()

      expect(result).toEqual({ skip: 0, take: 10 })
    })

    it('should use custom page and limit', () => {
      const result = paginate({ page: '3', limit: '20' })

      expect(result).toEqual({ skip: 40, take: 20 })
    })

    it('should use absolute values for negative numbers', () => {
      const result = paginate({ page: '-2', limit: '-5' })

      expect(result).toEqual({ skip: 5, take: 5 })
    })

    it('should produce NaN skip/take when query values are NaN (no default applied)', () => {
      const result = paginate({ page: 'abc', limit: 'xyz' })

      expect(result.skip).toBeNaN()
      expect(result.take).toBeNaN()
    })
  })

  describe('paginateOutput', () => {
    it('should return paginated output with next and prev pages', () => {
      const data = Array.from({ length: 10 }, (_, i) => ({ id: i }))
      const result = paginateOutput({
        data,
        total: 50,
        query: { page: '2', limit: '10' },
      })

      expect(result).toEqual({
        data,
        meta: {
          currentPage: 2,
          lastPage: 5,
          nextPage: 3,
          prevPage: 1,
          total: 50,
          totalPerPage: 10,
        },
      })
    })

    it('should return null for prev page when on first page', () => {
      const data = Array.from({ length: 10 }, (_, i) => ({ id: i }))
      const result = paginateOutput({
        data,
        total: 50,
        query: { page: '1', limit: '10' },
      })

      expect(result.meta.prevPage).toBeNull()
      expect(result.meta.nextPage).toBe(2)
    })

    it('should return null for next page when on last page', () => {
      const data = Array.from({ length: 10 }, (_, i) => ({ id: i }))
      const result = paginateOutput({
        data,
        total: 50,
        query: { page: '5', limit: '10' },
      })

      expect(result.meta.nextPage).toBeNull()
      expect(result.meta.prevPage).toBe(4)
    })

    it('should return empty meta when data is empty', () => {
      const result = paginateOutput({
        data: [],
        total: 0,
        query: { page: '1', limit: '10' },
      })

      expect(result).toEqual({
        data: [],
        meta: {
          total: 0,
          currentPage: 1,
          lastPage: 1,
          nextPage: null,
          prevPage: null,
          totalPerPage: 10,
        },
      })
    })

    it('should throw NotFoundException when page exceeds lastPage with data', () => {
      expect(() =>
        paginateOutput({
          data: [],
          total: 10,
          query: { page: '5', limit: '10' },
        }),
      ).toThrow(NotFoundException)
    })

    it('should throw NotFoundException when page exceeds lastPage even when total is 0', () => {
      expect(() =>
        paginateOutput({
          data: [],
          total: 0,
          query: { page: '5', limit: '10' },
        }),
      ).toThrow(NotFoundException)
    })
  })
})
