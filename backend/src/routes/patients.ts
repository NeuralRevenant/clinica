import { minLength } from "zod";

export default async function routes(fastify: FastifyInstance) {
  const need = fastify.requireScopes;

  fastify.get('/patients',
    {
      preHandler: [fastify.authenticate, need(['patient/*.write'])],
      schema: {
        headers: {
          type: 'object',
          additionalProperties: false,
          properties: { authorization: { type: 'string', pattern: '^Bearer\\s.+' } },
          required: ['authorization']
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            mrn: { type: 'string', minLength: 1 },
            name: { type: 'string', minLength: 1 },
            dob: { type: 'string', format: 'date' },
            gender: { type: 'string', enum: ['male', 'female', 'other', 'unknown'] },
            active: { type: 'boolean', default: true }
          },
          required: ['mrn', 'name']
        },
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              mrn: { type: 'string' },
              name: { type: 'string' },
              dob: { type: 'string', format: 'date' },
              gender: { type: 'string', enum: ['male', 'female', 'other', 'unknown'] },
              active: { type: 'boolean' }
            },
            required: ['id', 'mrn', 'name']
          }
        }
      }
    }, async (req, reply) => {
    }
  );

  fastify.get('/patients/:id',
    {
      preHandler: [fastify.authenticate, need(['patient/*.read'])],
      schema: {
        headers: {
          type: 'object',
          additionalProperties: false,
          properties: { authorization: { type: 'string', pattern: '^Bearer\\s.+' } },
          required: ['authorization']
        },
        params: {
          type: 'object',
          additionalProperties: false,
          properties: { id: { type: 'string', minLength: 1 } },
          required: ['id']
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              mrn: { type: 'string' },
              name: { type: 'string' },
              dob: { type: 'string', format: 'date' },
              gender: { type: 'string' },
              active: { type: 'boolean' }
            },
            required: ['id', 'mrn', 'name']
          }
        }
      }
    }, async (req) => ({}));
}