import fastifyPlugin from "fastify-plugin";
import { Client } from '@opensearch-project/opensearch';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';

async function opensearchConnector(fastify: FastifyInstance, options: FastifyPluginOptions) {
  const node = process.env.OPENSEARCH_URL || 'http://localhost:9200';
  const client = new Client({
    node,
    auth: {
      username: process.env.OPENSEARCH_USERNAME || 'admin',
      password: process.env.OPENSEARCH_PASSWORD || 'admin'
    },
    ssl: {
      rejectUnauthorized: false // for local dev
    }
  });

  try {
    const info = await client.info();
    fastify.log.info(`Connected to OpenSearch: ${info.body.cluster_name}`);
  } catch (err: any) {
    fastify.log.error('Failed to connect to OpenSearch:', err);
    throw err;
  }

  // decorating Fastify to access fastify.opensearch anywhere
  fastify.decorate('opensearch', client);

  fastify.addHook('onClose', async () => {
    await client.close();
  });
}

export default fastifyPlugin(opensearchConnector, {
  name: 'opensearch-connector'
});

// Typings for TypeScript
declare module 'fastify' {
  interface FastifyInstance {
    opensearch: Client;
  }
}