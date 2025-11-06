import fastifyPlugin from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

type User = {
  sub: string;
  email?: string;
  roles?: string[];
  scopes?: string[];
  tenantId?: string;
};

declare module 'fastify' { // adding additional typings to the FastifyInstance and FastifyRequest
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireScopes: (scopes: readonly string[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    user: User | null;
    idempotencyKey?: string | null;
  }
}

export default fastifyPlugin(async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('user', null); // initialize user property

  fastify.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Missing bearer token' });
    }

    const token = auth.slice(7).trim();
    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_PUBLIC_KEY ?? 'dev-secret', // RS256 public key or HS256 secret
        { algorithms: ['RS256', 'HS256'] }
      ) as User;

      req.user = payload;
      req.idempotencyKey = (req.headers['idempotency-key'] as string | undefined) ?? null;
    } catch {
      return reply.code(401).send({ error: 'unauthorized', message: 'Invalid token' });
    }
  });

  // authorization helper to check required scopes
  fastify.decorate('requireScopes', (needed: readonly string[]) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      const have = new Set(req.user?.scopes ?? []);
      const ok = needed.every(s => have.has(s));
      if (!ok) {
        return reply.code(403).send({ error: 'forbidden', message: 'Insufficient scopes' });
      }
    };
  });
},
  {
    name: 'auth-plugin'
  }
);