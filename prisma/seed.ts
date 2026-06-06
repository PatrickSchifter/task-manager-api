import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  CollaboratorRole,
  Role,
  TaskPriority,
  PrismaClient
} from '../src/generated/prisma/client'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

async function main() {
  console.log('🌱 Seeding database...')

  // 👤 Users
  const user1 = await prisma.user.create({
    data: {
      name: 'Patrick',
      email: 'patrick@example.com',
      password: '$2b$12$Lvih8ejnZcTGv7CNgsO2OehhKLnSD6u2HniQRmBeMIqTNQsBSG.Mm', //123456
      role: Role.ADMIN,
    },
  })

  const user2 = await prisma.user.create({
    data: {
      name: 'John Doe',
      email: 'john@example.com',
      password: '$2b$12$Lvih8ejnZcTGv7CNgsO2OehhKLnSD6u2HniQRmBeMIqTNQsBSG.Mm', //123456
    },
  })

  // 📁 Project
  const project = await prisma.project.create({
    data: {
      name: 'Task Manager',
      description: 'Projeto de gerenciamento de tarefas',
      createdById: user1.id,
    },
  })

  // 🤝 Collaborators
  await prisma.projectCollaborator.createMany({
    data: [
      {
        userId: user1.id,
        projectId: project.id,
        role: CollaboratorRole.OWNER,
      },
      {
        userId: user2.id,
        projectId: project.id,
        role: CollaboratorRole.EDITOR,
      },
    ],
  })

  // 📌 Tasks
  const task1 = await prisma.task.create({
    data: {
      title: 'Criar backend',
      description: 'Configurar NestJS + Prisma',
      status: 'IN_PROGRESS',
      priority: TaskPriority.HIGH,
      projectId: project.id,
      assigneeId: user1.id,
      dueDate: new Date(),
    },
  })

  const task2 = await prisma.task.create({
    data: {
      title: 'Criar frontend',
      description: 'Setup Next.js',
      status: 'TODO',
      priority: TaskPriority.MEDIUM,
      projectId: project.id,
      assigneeId: user2.id,
    },
  })

  // 💬 Comments
  await prisma.comment.createMany({
    data: [
      {
        content: 'Comecei essa task!',
        authorId: user1.id,
        taskId: task1.id,
      },
      {
        content: 'Vou iniciar amanhã',
        authorId: user2.id,
        taskId: task2.id,
      },
    ],
  })

  console.log('✅ Seed finalizado!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
