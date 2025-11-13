import fastifyPlugin from 'fastify-plugin';
import Redis from 'ioredis';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';

async function redisConnector(fastify: FastifyInstance, options: FastifyPluginOptions) {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3
  });

  redis.on('connect', () => {
    fastify.log.info('Connected to Redis');
  });

  redis.on('error', (err: Error) => {
    fastify.log.error('Redis connection error:', err);
  });

  // Test connection
  try {
    await redis.ping();
    fastify.log.info('Redis connection verified');
  } catch (err: any) {
    fastify.log.error('Failed to connect to Redis:', err);
    throw err;
  }

  // Decorate Fastify instance with Redis client
  fastify.decorate('redis', redis);

  // Close Redis connection when Fastify closes
  fastify.addHook('onClose', async () => {
    await redis.quit();
    fastify.log.info('Redis connection closed');
  });
}

export default fastifyPlugin(redisConnector, {
  name: 'redis-connector'
});

// TypeScript declarations
declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}
