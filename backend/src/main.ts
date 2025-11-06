import Fastify from 'fastify';
import cors from '@fastify/cors';

import mongodbConnector from './plugins/mongodb.js';

const fastify = Fastify({ logger: true });

// CORS configuration
await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

// Register MongoDB connector
await fastify.register(mongodbConnector);

fastify.listen({ port: 3000 }, function (err, address) { // server is listening on ${address}
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});