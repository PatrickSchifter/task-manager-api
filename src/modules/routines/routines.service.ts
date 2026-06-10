import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { PrismaService } from 'src/prisma/prisma.service'
import { RagService } from 'src/modules/rag/rag.service'
import { paginate, paginateOutput } from 'src/utils/pagination.utils'
import {
  RoutineFullDTO,
  RoutineItemListDTO,
  RoutineTimeInputDTO,
  RoutinesRequestDTO,
  ToggleCompletionDTO,
} from './routines.dto'

const routineTimeSelect = { id: true, startTime: true, endTime: true } as const

// Converte "YYYY-MM-DD" ou ISO string para um Date às 00:00:00 UTC,
// preservando exatamente o dia informado sem deslocamento de fuso.
function parseDateOnly(value: string): Date {
  const datePart = value.slice(0, 10)
  const parsed = new Date(`${datePart}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Data inválida')
  return parsed
}

@Injectable()
export class RoutinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rag: RagService,
  ) {}

  async findAll({ ownerId, query }: { ownerId: string; query?: QueryPaginationDTO }) {
    const { skip, take } = paginate(query)
    const where = { ownerId }

    const todayStr = new Date().toLocaleDateString('sv')
    const todayDate = new Date(`${todayStr}T00:00:00.000Z`)

    const [routines, total] = await Promise.all([
      this.prisma.routine.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          active: true,
          days: true,
          createdAt: true,
          updatedAt: true,
          times: {
            select: {
              ...routineTimeSelect,
              completions: { where: { date: todayDate }, select: { id: true } },
            },
            orderBy: { startTime: 'asc' },
          },
        },
      }),
      this.prisma.routine.count({ where }),
    ])

    return paginateOutput<RoutineItemListDTO>({
      data: routines.map((r) => ({
        ...r,
        times: r.times.map((t) => ({
          id: t.id,
          startTime: t.startTime,
          endTime: t.endTime,
          completedToday: t.completions.length > 0,
        })),
      })) as RoutineItemListDTO[],
      total,
      query,
    })
  }

  async findById({ id, ownerId }: { id: string; ownerId: string }) {
    const routine = await this.prisma.routine.findFirst({
      where: { id, ownerId },
      select: {
        id: true,
        title: true,
        description: true,
        active: true,
        days: true,
        createdAt: true,
        updatedAt: true,
        times: {
          select: {
            ...routineTimeSelect,
            completions: { select: { date: true } },
          },
          orderBy: { startTime: 'asc' },
        },
      },
    })

    if (!routine) throw new NotFoundException('Rotina não encontrada')

    const todayStr = new Date().toLocaleDateString('sv')

    return {
      ...routine,
      times: routine.times.map((t) => {
        const completedDates = t.completions.map((c) => c.date.toISOString().slice(0, 10))
        return {
          id: t.id,
          startTime: t.startTime,
          endTime: t.endTime,
          completedDates,
          completedToday: completedDates.includes(todayStr),
        }
      }),
    } satisfies RoutineFullDTO
  }

  async create({ ownerId, data }: { ownerId: string; data: RoutinesRequestDTO }) {
    this.assertUniqueTimes(data.times)

    const routine = await this.prisma.routine.create({
      data: {
        title: data.title,
        description: data.description,
        active: data.active ?? true,
        days: data.days ?? [],
        ownerId,
        times: {
          create: data.times.map((t) => ({ startTime: t.startTime, endTime: t.endTime })),
        },
      },
      select: {
        id: true,
        title: true,
        description: true,
        active: true,
        days: true,
        createdAt: true,
        updatedAt: true,
        times: { select: routineTimeSelect, orderBy: { startTime: 'asc' } },
      },
    })
    this.rag.dispatchRoutineEmbedding(routine.id)
    return routine
  }

  async update({ id, ownerId, data }: { id: string; ownerId: string; data: RoutinesRequestDTO }) {
    await this.assertOwnership(id, ownerId)
    this.assertUniqueTimes(data.times)

    const routine = await this.prisma.routine.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        active: data.active ?? true,
        days: data.days ?? [],
        times: {
          deleteMany: {},
          create: data.times.map((t) => ({ startTime: t.startTime, endTime: t.endTime })),
        },
      },
      select: {
        id: true,
        title: true,
        description: true,
        active: true,
        days: true,
        createdAt: true,
        updatedAt: true,
        times: { select: routineTimeSelect, orderBy: { startTime: 'asc' } },
      },
    })
    this.rag.dispatchRoutineEmbedding(routine.id)
    return routine
  }

  async delete({ id, ownerId }: { id: string; ownerId: string }) {
    await this.assertOwnership(id, ownerId)
    await this.prisma.routine.delete({ where: { id } })
    this.rag.dispatchRoutineDelete(id)
  }

  async toggleCompletion({
    routineId,
    timeId,
    ownerId,
    data,
  }: {
    routineId: string
    timeId: string
    ownerId: string
    data: ToggleCompletionDTO
  }) {
    const routineTime = await this.prisma.routineTime.findFirst({
      where: { id: timeId, routineId, routine: { ownerId } },
      select: { id: true },
    })
    if (!routineTime) throw new NotFoundException('Horário de rotina não encontrado')

    const date = parseDateOnly(data.date)

    const existing = await this.prisma.routineCompletion.findUnique({
      where: { routineTimeId_date: { routineTimeId: timeId, date } },
      select: { id: true },
    })

    if (existing) {
      await this.prisma.routineCompletion.delete({ where: { id: existing.id } })
      return { completed: false, date: data.date }
    }

    await this.prisma.routineCompletion.create({
      data: { routineTimeId: timeId, date },
    })
    return { completed: true, date: data.date }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private assertUniqueTimes(times: RoutineTimeInputDTO[]) {
    const unique = new Set(times.map((t) => t.startTime))
    if (unique.size !== times.length) {
      throw new ConflictException('Os horários de início informados contêm duplicatas')
    }
  }

  private async assertOwnership(id: string, ownerId: string) {
    const routine = await this.prisma.routine.findFirst({
      where: { id, ownerId },
      select: { id: true },
    })
    if (!routine) throw new NotFoundException('Rotina não encontrada')
  }
}
