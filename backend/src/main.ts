import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig, validateConfig } from './config/env.js';

// Import plugins
import mongodbConnector from './plugins/mongodb.js';
import opensearchConnector from './plugins/opensearch.js';
import redisConnector from './plugins/redis.js';
import langchainConnector from './plugins/langchain.js';
import authPlugin from './plugins/auth.js';

// Load and validate configuration
const config = loadConfig();
validateConfig(config);

const fastify = Fastify({ 
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug'
  }
});

// CORS configuration
await fastify.register(cors, {
  origin: config.nodeEnv === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || []
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  credentials: true
});

// Register infrastructure plugins
await fastify.register(mongodbConnector);
await fastify.register(opensearchConnector);
await fastify.register(redisConnector);
await fastify.register(langchainConnector);
await fastify.register(authPlugin);

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      mongodb: 'unknown',
      opensearch: 'unknown',
      redis: 'unknown'
    }
  };

  // Check MongoDB
  try {
    await fastify.mongo.db.admin().ping();
    health.services.mongodb = 'connected';
  } catch (error) {
    health.services.mongodb = 'disconnected';
    health.status = 'degraded';
  }

  // Check OpenSearch
  try {
    await fastify.opensearch.ping();
    health.services.opensearch = 'connected';
  } catch (error) {
    health.services.opensearch = 'disconnected';
    health.status = 'degraded';
  }

  // Check Redis
  try {
    await fastify.redis.ping();
    health.services.redis = 'connected';
  } catch (error) {
    health.services.redis = 'disconnected';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  return reply.code(statusCode).send(health);
});

// Root endpoint
fastify.get('/', async (request, reply) => {
  return {
    name: 'Intelligent Medical Assistant API',
    version: '1.0.0',
    status: 'running',
    environment: config.nodeEnv
  };
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ 
      port: config.port,
      host: '0.0.0.0' // Listen on all interfaces
    });
    
    fastify.log.info(`Server listening on port ${config.port}`);
    fastify.log.info(`Environment: ${config.nodeEnv}`);
    fastify.log.info(`LangSmith tracing: ${config.langchainTracingV2 ? 'enabled' : 'disabled'}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();