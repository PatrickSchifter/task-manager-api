import { faker } from '@faker-js/faker'
import { QueryPaginationDTO } from 'src/common/dtos/query.pagination.dto'
import { CollaboratorRole } from 'src/generated/prisma/enums'

export const mockedProjects = faker.helpers.multiple(
  () => {
    return {
      id: faker.string.uuid(),
      name: faker.lorem.sentence(),
      description: faker.lorem.sentence(),
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
      role: CollaboratorRole.OWNER,
      membersCount: 1,
    }
  },
  { count: 10 },
)

export const mockPaginationQuery: QueryPaginationDTO = {
  limit: '10',
  page: '1',
}
