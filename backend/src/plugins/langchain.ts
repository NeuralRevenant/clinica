import fastifyPlugin from 'fastify-plugin';
import { ChatOpenAI } from '@langchain/openai';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';

async function langchainConnector(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // Validate OpenAI API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your-openai-api-key-here') {
    fastify.log.warn('OpenAI API key not configured. LangChain features will not work.');
  }

  // Configure LangSmith tracing if enabled
  if (process.env.LANGCHAIN_TRACING_V2 === 'true') {
    const langsmithKey = process.env.LANGCHAIN_API_KEY;
    if (!langsmithKey || langsmithKey === 'your-langsmith-api-key-here') {
      fastify.log.warn('LangSmith API key not configured. Tracing will not work.');
    } else {
      fastify.log.info('LangSmith tracing enabled');
    }
  }

  // Create OpenAI model instance
  const model = new ChatOpenAI({
    modelName: process.env.OPENAI_MODEL || 'gpt-4',
    temperature: 0,
    openAIApiKey: apiKey,
    maxRetries: 3,
    timeout: 60000 // 60 seconds
  });

  // Create a model instance for embeddings
  const embeddingModel = new ChatOpenAI({
    modelName: 'text-embedding-3-small',
    openAIApiKey: apiKey
  });

  // Decorate Fastify instance with LangChain models
  fastify.decorate('llm', model);
  fastify.decorate('embeddingModel', embeddingModel);

  fastify.log.info('LangChain configured successfully');
}

export default fastifyPlugin(langchainConnector, {
  name: 'langchain-connector'
});

// TypeScript declarations
declare module 'fastify' {
  interface FastifyInstance {
    llm: ChatOpenAI;
    embeddingModel: ChatOpenAI;
  }
}
