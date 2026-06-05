// Tokens de cor das tags. O mesmo conjunto é entendido pelo frontend
// (src/theme/tagColors.ts) para renderizar os chips.
export const TAG_COLORS = ['brand', 'emerald', 'amber', 'rose', 'violet', 'cyan', 'muted'] as const

export type TagColor = (typeof TAG_COLORS)[number]

// Mapa-semente: nomes conhecidos sempre recebem a mesma cor (exemplos do produto).
const SEED_COLORS: Record<string, TagColor> = {
  design: 'amber',
  backend: 'emerald',
  frontend: 'brand',
  mobile: 'brand',
  pesquisa: 'brand',
  research: 'brand',
  urgente: 'amber',
  urgent: 'amber',
  done: 'muted',
  concluído: 'muted',
  concluido: 'muted',
}

// Paleta usada no fallback por hash. Exclui 'muted' (reservado para estados
// "concluído/done"), para que tags arbitrárias recebam cores vivas.
const HASH_PALETTE: TagColor[] = ['brand', 'emerald', 'amber', 'rose', 'violet', 'cyan']

// Cor determinística para uma tag: nomes conhecidos pelo mapa-semente, os demais
// por hash do nome (mesmo nome → mesma cor, sempre).
export function pickTagColor(name: string): TagColor {
  const key = name.trim().toLowerCase()
  if (SEED_COLORS[key]) return SEED_COLORS[key]

  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return HASH_PALETTE[hash % HASH_PALETTE.length]
}
