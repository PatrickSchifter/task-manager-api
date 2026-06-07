export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'text/markdown',
] as const

// v1: only text documents accepted for attachment upload
export const ALLOWED_MIME_TYPES: readonly string[] = [...DOCUMENT_MIME_TYPES]

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024

// Target chunk ~700 tokens ≈ 2500 chars at 3.5 chars/token
export const CHUNK_TARGET_CHARS = 2500
export const CHUNK_OVERLAP_CHARS = 375
