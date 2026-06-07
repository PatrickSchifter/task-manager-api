import { BASE_62_DIGITS, generateKeyBetween, generateNKeysBetween } from './fractional-indexing'

describe('fractional-indexing', () => {
  describe('generateKeyBetween', () => {
    it('returns "a0" when both bounds are null', () => {
      expect(generateKeyBetween(null, null)).toBe('a0')
    })

    it('generates a key before a given key (b only)', () => {
      const key = generateKeyBetween(null, 'a0')
      expect(key < 'a0').toBe(true)
    })

    it('generates a key after a given key (a only)', () => {
      const key = generateKeyBetween('a0', null)
      expect(key > 'a0').toBe(true)
      expect(key).toBe('a1')
    })

    it('generates a key strictly between two keys', () => {
      const a = 'a0'
      const b = 'a1'
      const mid = generateKeyBetween(a, b)
      expect(a < mid).toBe(true)
      expect(mid < b).toBe(true)
    })

    it('throws when a >= b', () => {
      expect(() => generateKeyBetween('a1', 'a0')).toThrow()
      expect(() => generateKeyBetween('a0', 'a0')).toThrow()
    })

    it('throws on an invalid order key (bad integer head)', () => {
      // O head precisa ser uma letra (a-z/A-Z); um dígito é inválido.
      expect(() => generateKeyBetween('1abc', null)).toThrow()
    })

    it('produces keys that sort correctly when inserting repeatedly at the front', () => {
      let b: string | null = null
      const keys: string[] = []
      for (let i = 0; i < 20; i++) {
        b = generateKeyBetween(null, b)
        keys.unshift(b)
      }
      const sorted = [...keys].sort()
      expect(keys).toEqual(sorted)
    })

    it('produces keys that sort correctly when appending at the end', () => {
      let a: string | null = null
      const keys: string[] = []
      for (let i = 0; i < 20; i++) {
        a = generateKeyBetween(a, null)
        keys.push(a)
      }
      const sorted = [...keys].sort()
      expect(keys).toEqual(sorted)
    })
  })

  describe('generateNKeysBetween', () => {
    it('returns an empty array for n = 0', () => {
      expect(generateNKeysBetween(null, null, 0)).toEqual([])
    })

    it('returns a single key for n = 1', () => {
      const keys = generateNKeysBetween(null, null, 1)
      expect(keys).toHaveLength(1)
      expect(keys[0]).toBe('a0')
    })

    it('returns n ordered, distinct keys with both bounds null', () => {
      const keys = generateNKeysBetween(null, null, 10)
      expect(keys).toHaveLength(10)
      expect(new Set(keys).size).toBe(10)
      expect([...keys].sort()).toEqual(keys)
    })

    it('returns n ordered keys before b', () => {
      const keys = generateNKeysBetween(null, 'a0', 5)
      expect(keys).toHaveLength(5)
      expect([...keys].sort()).toEqual(keys)
      expect(keys[keys.length - 1] < 'a0').toBe(true)
    })

    it('returns n ordered keys after a', () => {
      const keys = generateNKeysBetween('a0', null, 5)
      expect(keys).toHaveLength(5)
      expect([...keys].sort()).toEqual(keys)
      expect(keys[0] > 'a0').toBe(true)
    })

    it('returns n ordered keys strictly between a and b', () => {
      const a = 'a0'
      const b = 'a1'
      const keys = generateNKeysBetween(a, b, 8)
      expect(keys).toHaveLength(8)
      expect(new Set(keys).size).toBe(8)
      expect([...keys].sort()).toEqual(keys)
      expect(a < keys[0]).toBe(true)
      expect(keys[keys.length - 1] < b).toBe(true)
    })
  })

  it('exposes the base-62 digit set', () => {
    expect(BASE_62_DIGITS).toHaveLength(62)
    expect(BASE_62_DIGITS[0]).toBe('0')
  })
})
