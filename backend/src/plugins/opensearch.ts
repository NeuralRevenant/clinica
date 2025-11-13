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

  // Decorate Fastify to access fastify.opensearch anywhere
  fastify.decorate('opensearch', client);

  // Create index templates on startup
  fastify.addHook('onReady', async () => {
    await createIndexTemplates(client, fastify);
  });

  fastify.addHook('onClose', async () => {
    await client.close();
  });
}

async function createIndexTemplates(client: Client, fastify: FastifyInstance) {
  try {
    // Patients index template
    await client.indices.putIndexTemplate({
      name: 'patients_template',
      body: {
        index_patterns: ['patients*'],
        template: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
            'index.knn': true
          },
          mappings: {
            properties: {
              patientId: { type: 'keyword' },
              fullName: { type: 'text', analyzer: 'standard' },
              familyName: { type: 'keyword' },
              givenName: { type: 'keyword' },
              gender: { type: 'keyword' },
              birthDate: { type: 'date' },
              age: { type: 'integer' },
              city: { type: 'keyword' },
              state: { type: 'keyword' },
              postalCode: { type: 'keyword' },
              phone: { type: 'keyword' },
              email: { type: 'keyword' },
              active: { type: 'boolean' },
              identifierValues: { type: 'keyword' },
              embeddingVector: {
                type: 'knn_vector',
                dimension: 1536,
                method: {
                  name: 'hnsw',
                  space_type: 'cosinesimil',
                  engine: 'nmslib'
                }
              },
              lastUpdated: { type: 'date' }
            }
          }
        }
      }
    });

    // Documents index template
    await client.indices.putIndexTemplate({
      name: 'documents_template',
      body: {
        index_patterns: ['documents*'],
        template: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
            'index.knn': true
          },
          mappings: {
            properties: {
              documentId: { type: 'keyword' },
              patientId: { type: 'keyword' },
              patientName: { type: 'text' },
              documentType: { type: 'keyword' },
              fhirResourceType: { type: 'keyword' },
              extractedText: { type: 'text', analyzer: 'standard' },
              medicalEntities: {
                properties: {
                  conditions: { type: 'keyword' },
                  medications: { type: 'keyword' },
                  procedures: { type: 'keyword' },
                  observations: { type: 'keyword' }
                }
              },
              embeddingVector: {
                type: 'knn_vector',
                dimension: 1536,
                method: {
                  name: 'hnsw',
                  space_type: 'cosinesimil',
                  engine: 'nmslib'
                }
              },
              uploadTimestamp: { type: 'date' },
              uploadMethod: { type: 'keyword' },
              fileName: { type: 'keyword' },
              tags: { type: 'keyword' },
              keywords: { type: 'keyword' }
            }
          }
        }
      }
    });

    // Observations index template
    await client.indices.putIndexTemplate({
      name: 'observations_template',
      body: {
        index_patterns: ['observations*'],
        template: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
            'index.knn': true
          },
          mappings: {
            properties: {
              observationId: { type: 'keyword' },
              patientId: { type: 'keyword' },
              patientName: { type: 'text' },
              observationCode: { type: 'keyword' },
              observationDisplay: { type: 'text' },
              valueString: { type: 'text' },
              valueQuantity: { type: 'float' },
              effectiveDate: { type: 'date' },
              category: { type: 'keyword' },
              embeddingVector: {
                type: 'knn_vector',
                dimension: 1536,
                method: {
                  name: 'hnsw',
                  space_type: 'cosinesimil',
                  engine: 'nmslib'
                }
              }
            }
          }
        }
      }
    });

    // Conditions index template
    await client.indices.putIndexTemplate({
      name: 'conditions_template',
      body: {
        index_patterns: ['conditions*'],
        template: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
            'index.knn': true
          },
          mappings: {
            properties: {
              conditionId: { type: 'keyword' },
              patientId: { type: 'keyword' },
              patientName: { type: 'text' },
              conditionCode: { type: 'keyword' },
              conditionDisplay: { type: 'text' },
              clinicalStatus: { type: 'keyword' },
              severity: { type: 'keyword' },
              onsetDate: { type: 'date' },
              embeddingVector: {
                type: 'knn_vector',
                dimension: 1536,
                method: {
                  name: 'hnsw',
                  space_type: 'cosinesimil',
                  engine: 'nmslib'
                }
              }
            }
          }
        }
      }
    });

    // Medications index template
    await client.indices.putIndexTemplate({
      name: 'medications_template',
      body: {
        index_patterns: ['medications*'],
        template: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
            'index.knn': true
          },
          mappings: {
            properties: {
              medicationId: { type: 'keyword' },
              patientId: { type: 'keyword' },
              patientName: { type: 'text' },
              medicationCode: { type: 'keyword' },
              medicationDisplay: { type: 'text' },
              dosageText: { type: 'text' },
              status: { type: 'keyword' },
              effectivePeriod: {
                properties: {
                  start: { type: 'date' },
                  end: { type: 'date' }
                }
              },
              embeddingVector: {
                type: 'knn_vector',
                dimension: 1536,
                method: {
                  name: 'hnsw',
                  space_type: 'cosinesimil',
                  engine: 'nmslib'
                }
              }
            }
          }
        }
      }
    });

    fastify.log.info('OpenSearch index templates created successfully');
  } catch (err: any) {
    fastify.log.error('Failed to create OpenSearch index templates:', err);
    // Don't throw - allow app to start even if templates fail
  }
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