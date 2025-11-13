import { FastifyInstance } from 'fastify';

export default async function routes(fastify: FastifyInstance) {
  const need = fastify.requireScopes;

  fastify.get('/users/me',
    {
      preHandler: [fastify.authenticate, need(['patient/*.read', 'document/*.read'])],
      schema: {
        headers: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authorization: { type: 'string', pattern: '^Bearer\\s.+' },
            'idempotency-key': { type: 'string', format: 'uuid' }
          },
          required: ['authorization']
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              email: { type: 'string', format: 'email' },
              roles: { type: 'array', items: { type: 'string' } },
              scopes: { type: 'array', items: { type: 'string' } },
              tenantId: { type: 'string' }
            },
            required: ['id', 'email', 'roles', 'scopes']
          }
        }
      }
    }, async (req) => {
      const user: any = req.user;
      return { id: user.sub ?? 'User', email: user.email, roles: user.roles ?? [], scopes: user.scopes ?? [], tenantId: user.tenantId };
    });
}