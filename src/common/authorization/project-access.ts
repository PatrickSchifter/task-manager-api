/**
 * Cláusula Prisma de acesso a um projeto: o usuário é o dono (createdById) OU
 * um colaborador. É a MESMA regra aplicada pelo ValidateResourcesIdsInterceptor
 * no caminho HTTP, centralizada aqui para que os services de domínio possam se
 * autoautorizar quando chamados FORA de uma request HTTP — por exemplo, pelo
 * consumer da fila (chat/MCP), onde o interceptor não roda.
 */
export function projectAccessWhere(userId: string) {
  return {
    OR: [{ createdById: userId }, { collaborators: { some: { userId } } }],
  }
}
