import { FastifyInstance } from 'fastify';

export default async function routes(fastify: FastifyInstance) {
  fastify.get('/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: { ok: { const: true } },
            required: ['ok']
          }
        }
      }
    },
    async () => ({ ok: true })
  );

  fastify.get('/version',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              version: { type: 'string' }
            },
            required: ['version']
          }
        }
      }
    },
    async () => ({ version: '1.0' })
  );
}