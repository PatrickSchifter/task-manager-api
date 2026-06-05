import { pickTagColor, TAG_COLORS } from './tag-color'

describe('pickTagColor', () => {
  it('returns the seeded color for known names (case-insensitive, trimmed)', () => {
    expect(pickTagColor('design')).toBe('amber')
    expect(pickTagColor('Backend')).toBe('emerald')
    expect(pickTagColor('  FRONTEND  ')).toBe('brand')
    expect(pickTagColor('done')).toBe('muted')
    expect(pickTagColor('concluído')).toBe('muted')
  })

  it('returns a deterministic color for unknown names', () => {
    const first = pickTagColor('some-random-tag')
    const second = pickTagColor('some-random-tag')
    expect(first).toBe(second)
  })

  it('hashes case-insensitively (same color regardless of casing)', () => {
    expect(pickTagColor('MyTag')).toBe(pickTagColor('mytag'))
  })

  it('always returns a valid color token', () => {
    for (const name of ['a', 'foobar', 'xyz', '12345', 'tag with spaces']) {
      expect(TAG_COLORS).toContain(pickTagColor(name))
    }
  })

  it('never returns "muted" from the hash fallback', () => {
    // 'muted' é reservado para estados concluído/done e fica fora da paleta de hash.
    for (let i = 0; i < 200; i++) {
      const color = pickTagColor(`unknown-tag-${i}`)
      expect(color).not.toBe('muted')
    }
  })
})
