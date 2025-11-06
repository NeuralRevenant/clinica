import fastifyPlugin from 'fastify-plugin';
import fastifyMongo from '@fastify/mongodb';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';

// plugin function for mongodb connection
async function mongodbConnector(fastify: FastifyInstance, options: FastifyPluginOptions) {
  const url = process.env.MONGODB_URL || 'mongodb://localhost:27017/medical-assistant';
  await fastify.register(fastifyMongo, {
    url: url,
    forceClose: true
  });
}

export default fastifyPlugin(mongodbConnector, { name: 'mongodb-connector' });