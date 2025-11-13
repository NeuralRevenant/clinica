import { config } from 'dotenv';

// Load environment variables from .env file
config();

export interface AppConfig {
  // Server
  port: number;
  nodeEnv: string;
  
  // MongoDB
  mongodbUrl: string;
  mongodbDbName: string;
  
  // OpenSearch
  opensearchUrl: string;
  opensearchUsername: string;
  opensearchPassword: string;
  
  // Redis
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  redisDb: number;
  
  // OpenAI
  openaiApiKey: string;
  openaiModel: string;
  
  // LangSmith
  langchainTracingV2: boolean;
  langchainApiKey?: string;
  langchainProject?: string;
  
  // Security
  jwtSecret: string;
  jwtPublicKey?: string;
  encryptionKey: string;
  
  // Session
  sessionTimeoutMinutes: number;
}

export function loadConfig(): AppConfig {
  return {
    // Server
    port: parseInt(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // MongoDB
    mongodbUrl: process.env.MONGODB_URL || 'mongodb://localhost:27017/medical-assistant',
    mongodbDbName: process.env.MONGODB_DB_NAME || 'medical-assistant',
    
    // OpenSearch
    opensearchUrl: process.env.OPENSEARCH_URL || 'http://localhost:9200',
    opensearchUsername: process.env.OPENSEARCH_USERNAME || 'admin',
    opensearchPassword: process.env.OPENSEARCH_PASSWORD || 'admin',
    
    // Redis
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.REDIS_PORT || '6379'),
    redisPassword: process.env.REDIS_PASSWORD || undefined,
    redisDb: parseInt(process.env.REDIS_DB || '0'),
    
    // OpenAI
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4',
    
    // LangSmith
    langchainTracingV2: process.env.LANGCHAIN_TRACING_V2 === 'true',
    langchainApiKey: process.env.LANGCHAIN_API_KEY,
    langchainProject: process.env.LANGCHAIN_PROJECT || 'medical-assistant',
    
    // Security
    jwtSecret: process.env.JWT_SECRET || 'dev-secret',
    jwtPublicKey: process.env.JWT_PUBLIC_KEY,
    encryptionKey: process.env.ENCRYPTION_KEY || '',
    
    // Session
    sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '15')
  };
}

export function validateConfig(config: AppConfig): void {
  const errors: string[] = [];
  
  if (config.nodeEnv === 'production') {
    if (!config.openaiApiKey || config.openaiApiKey === 'your-openai-api-key-here') {
      errors.push('OPENAI_API_KEY must be set in production');
    }
    
    if (!config.encryptionKey || config.encryptionKey === 'your-aes-256-encryption-key-here') {
      errors.push('ENCRYPTION_KEY must be set in production');
    }
    
    if (config.jwtSecret === 'dev-secret') {
      errors.push('JWT_SECRET must be changed from default in production');
    }
    
    if (config.opensearchPassword === 'admin') {
      errors.push('OPENSEARCH_PASSWORD should be changed from default in production');
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}
