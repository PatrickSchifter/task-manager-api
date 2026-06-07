import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { projectAccessWhere } from 'src/common/authorization/project-access'
import { CloudnaryService } from 'src/common/services/cloudnary/cloudnary.service'
import { Attachment, StorageProvider } from 'src/generated/prisma/client'
import { PrismaService } from 'src/prisma/prisma.service'
import { RagService } from '../rag/rag.service'
import { StorageService } from '../storage/storage.service'
import {
  ALLOWED_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES,
} from './attachment.constants'

// Magic-byte detection for allowed types (avoids ESM-only file-type package)
function detectMimeFromMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 4) return null

  // PDF: %PDF
  if (buffer.slice(0, 4).toString('ascii') === '%PDF') return 'application/pdf'

  // ZIP header — covers DOCX (Office Open XML)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)
    return 'application/zip'

  // OLE2 / CFBF — legacy .doc
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0)
    return 'application/msword'

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
    return 'image/png'

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp'

  return null
}

// text/* types carry no magic signature, so the declared MIME type is otherwise
// trusted. A NUL byte is the classic "this is binary" signal (git uses the same
// heuristic) — reject it to stop a binary payload smuggled in as text/plain.
function looksLikeText(buffer: Buffer): boolean {
  return !buffer.subarray(0, 8192).includes(0x00)
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly cloudnaryService: CloudnaryService,
    private readonly ragService: RagService,
  ) {}

  // ── Validation ─────────────────────────────────────────────────────────────

  validateFile(file: Express.Multer.File): { isImage: boolean } {
    const detected = detectMimeFromMagicBytes(file.buffer)

    // Accept DOCX declared type when bytes are ZIP (OOXML = ZIP container)
    const isOoxml = file.mimetype.includes('openxmlformats') || file.mimetype.includes('msword')
    const effectiveMime =
      detected === 'application/zip' && isOoxml ? file.mimetype : (detected ?? file.mimetype)

    if (!ALLOWED_MIME_TYPES.includes(effectiveMime)) {
      throw new BadRequestException(`Unsupported file type: ${effectiveMime}`)
    }

    // No magic bytes were matched but the file claims to be text — make sure it
    // actually is, instead of trusting the client-declared MIME type blindly.
    if (detected === null && effectiveMime.startsWith('text/') && !looksLikeText(file.buffer)) {
      throw new BadRequestException(`File "${file.originalname}" is not valid text`)
    }

    const isImage = (IMAGE_MIME_TYPES as readonly string[]).includes(effectiveMime)
    const maxSize = isImage ? MAX_IMAGE_SIZE_BYTES : MAX_DOCUMENT_SIZE_BYTES

    if (file.size > maxSize) {
      const limitMB = maxSize / (1024 * 1024)
      throw new BadRequestException(`File "${file.originalname}" exceeds ${limitMB} MB limit`)
    }

    return { isImage }
  }

  // ── Upload (returns data needed to create Attachment record) ───────────────

  async uploadToStorage(
    file: Express.Multer.File,
    attachmentId: string,
    taskId: string,
    isImage: boolean,
  ): Promise<{ provider: StorageProvider; storageKey: string; url: string | null }> {
    if (isImage) {
      const { url } = await this.cloudnaryService.upload({
        file,
        name: attachmentId,
        folder: `tasks/${taskId}/attachments`,
      })
      const storageKey = `tasks/${taskId}/attachments/${attachmentId}`
      return { provider: StorageProvider.CLOUDINARY, storageKey, url }
    }

    const path = `tasks/${taskId}/${attachmentId}-${file.originalname}`
    await this.storageService.upload({ buffer: file.buffer, path, contentType: file.mimetype })
    return { provider: StorageProvider.SUPABASE, storageKey: path, url: null }
  }

  async deleteStorageFile(attachment: {
    provider: StorageProvider
    storageKey: string
  }): Promise<void> {
    try {
      if (attachment.provider === StorageProvider.CLOUDINARY) {
        await this.cloudnaryService.delete(attachment.storageKey)
      } else {
        await this.storageService.remove(attachment.storageKey)
      }
    } catch (err) {
      this.logger.error(`Failed to delete file ${attachment.storageKey}: ${err}`)
    }
  }

  // ── Signed URL for download ────────────────────────────────────────────────

  async getUrl(attachmentId: string, actorId: string): Promise<string> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        task: {
          select: {
            project: {
              select: { id: true, createdById: true, collaborators: { select: { userId: true } } },
            },
          },
        },
      },
    })

    if (!attachment) throw new NotFoundException('Attachment not found')

    const project = attachment.task.project
    const hasAccess =
      project.createdById === actorId || project.collaborators.some((c) => c.userId === actorId)

    if (!hasAccess) throw new ForbiddenException('No access to this attachment')

    if (attachment.provider === StorageProvider.CLOUDINARY) {
      return attachment.url!
    }

    return this.storageService.createSignedUrl(attachment.storageKey, 60)
  }

  // ── Cascade cleanup ────────────────────────────────────────────────────────

  async cleanupForComment(commentId: string): Promise<void> {
    const attachments = await this.prisma.attachment.findMany({
      where: { commentId },
      select: { id: true, provider: true, storageKey: true },
    })

    for (const a of attachments) {
      await this.deleteStorageFile(a)
      this.ragService.dispatchAttachmentDelete(a.id)
    }
  }

  async cleanupForTasks(taskIds: string[]): Promise<void> {
    if (!taskIds.length) return

    const attachments = await this.prisma.attachment.findMany({
      where: { taskId: { in: taskIds } },
      select: { id: true, provider: true, storageKey: true },
    })

    for (const a of attachments) {
      await this.deleteStorageFile(a)
      this.ragService.dispatchAttachmentDelete(a.id)
    }
  }

  async cleanupForProject(projectId: string): Promise<void> {
    const attachments = await this.prisma.attachment.findMany({
      where: { task: { projectId } },
      select: { id: true, provider: true, storageKey: true },
    })

    for (const a of attachments) {
      await this.deleteStorageFile(a)
      this.ragService.dispatchAttachmentDelete(a.id)
    }
  }

  // ── Access check helper (re-exported for controller) ──────────────────────

  async assertTaskAccess(actorId: string, taskId: string): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: projectAccessWhere(actorId) },
      select: { id: true },
    })
    if (!task) throw new NotFoundException('Task not found')
  }

  findById(id: string): Promise<Attachment | null> {
    return this.prisma.attachment.findUnique({ where: { id } })
  }
}
