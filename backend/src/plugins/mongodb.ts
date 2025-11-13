import fastifyPlugin from 'fastify-plugin';
import fastifyMongo from '@fastify/mongodb';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';

// Plugin function for MongoDB connection with encryption support
async function mongodbConnector(fastify: FastifyInstance, options: FastifyPluginOptions) {
  const url = process.env.MONGODB_URL || 'mongodb://localhost:27017/medical-assistant';
  const dbName = process.env.MONGODB_DB_NAME || 'medical-assistant';
  
  await fastify.register(fastifyMongo, {
    url: url,
    database: dbName,
    forceClose: true,
    // Enable encryption at rest (requires MongoDB Enterprise or Atlas)
    // Client-side field level encryption can be configured here
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  fastify.log.info(`Connected to MongoDB: ${dbName}`);

  // Create indexes for collections on startup
  fastify.addHook('onReady', async () => {
    const db = fastify.mongo.db;
    
    // Patients collection indexes
    await db.collection('patients').createIndex({ patientId: 1 }, { unique: true });
    await db.collection('patients').createIndex({ 'identifier.value': 1 });
    await db.collection('patients').createIndex({ active: 1 });
    
    // Documents collection indexes
    await db.collection('documents').createIndex({ documentId: 1 }, { unique: true });
    await db.collection('documents').createIndex({ patientId: 1 });
    await db.collection('documents').createIndex({ documentType: 1 });
    await db.collection('documents').createIndex({ uploadTimestamp: -1 });
    
    // Observations collection indexes
    await db.collection('observations').createIndex({ observationId: 1 }, { unique: true });
    await db.collection('observations').createIndex({ patientId: 1 });
    await db.collection('observations').createIndex({ effectiveDateTime: -1 });
    
    // Conditions collection indexes
    await db.collection('conditions').createIndex({ conditionId: 1 }, { unique: true });
    await db.collection('conditions').createIndex({ patientId: 1 });
    
    // Medications collection indexes
    await db.collection('medications').createIndex({ medicationId: 1 }, { unique: true });
    await db.collection('medications').createIndex({ patientId: 1 });
    
    // Conversations collection indexes (for agent memory)
    await db.collection('conversations').createIndex({ conversationId: 1 }, { unique: true });
    await db.collection('conversations').createIndex({ userId: 1 });
    await db.collection('conversations').createIndex({ createdAt: -1 });
    
    // Agent memory collection indexes
    await db.collection('agent_memory').createIndex({ conversationId: 1 });
    await db.collection('agent_memory').createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 }); // TTL 1 hour
    
    // Audit log collection indexes
    await db.collection('audit_logs').createIndex({ timestamp: -1 });
    await db.collection('audit_logs').createIndex({ userId: 1 });
    await db.collection('audit_logs').createIndex({ documentId: 1 });
    
    fastify.log.info('MongoDB indexes created successfully');
  });
}

export default fastifyPlugin(mongodbConnector, { name: 'mongodb-connector' });