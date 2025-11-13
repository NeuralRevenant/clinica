import { Client } from '@opensearch-project/opensearch';
import { Db } from 'mongodb';
import { MedicalDocument } from './document.service.js';

export interface SearchQuery {
  text: string;
  patientId?: string;
  documentType?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  documentId: string;
  patientId: string;
  score: number;
  highlights: string[];
  document: Partial<MedicalDocument>;
  metadata: {
    searchMethod: 'keyword' | 'semantic' | 'hybrid';
    matchedFields: string[];
  };
}

export interface SearchResults {
  results: SearchResult[];
  total: number;
  took: number;
}

/**
 * Search Service - Handles OpenSearch indexing and search operations
 * Implements hybrid search (keyword + semantic), result ranking, and index synchronization
 */
export class SearchService {
  private client: Client;
  private db: Db;
  private readonly DOCUMENTS_INDEX = 'medical_documents';
  private readonly PATIENTS_INDEX = 'patients';
  private readonly OBSERVATIONS_INDEX = 'observations';
  private readonly CONDITIONS_INDEX = 'conditions';
  private readonly MEDICATIONS_INDEX = 'medications';

  constructor(client: Client, db: Db) {
    this.client = client;
    this.db = db;
  }

  /**
   * Initialize OpenSearch indices with mappings
   */
  async initializeIndices(): Promise<void> {
    await this.createDocumentsIndex();
    await this.createPatientsIndex();
    await this.createObservationsIndex();
    await this.createConditionsIndex();
    await this.createMedicationsIndex();
  }

  /**
   * Index a document in OpenSearch
   */
  async indexDocument(doc: MedicalDocument, embeddingVector?: number[]): Promise<void> {
    const indexDoc = {
      documentId: doc.documentId,
      patientId: doc.patientId,
      patientName: '', // Will be populated from patient data
      documentType: doc.documentType,
      fhirResourceType: doc.fhirResourceType,
      extractedText: doc.extractedText || '',
      medicalEntities: {
        conditions: [],
        medications: [],
        procedures: [],
        observations: [],
      },
      embeddingVector: embeddingVector || [],
      uploadTimestamp: doc.uploadTimestamp,
      uploadMethod: doc.uploadMethod,
      fileName: doc.fileName || '',
      tags: doc.tags || [],
      keywords: this.extractKeywords(doc.extractedText || ''),
    };

    await this.client.index({
      index: this.DOCUMENTS_INDEX,
      id: doc.documentId,
      body: indexDoc,
      refresh: true,
    });
  }

  /**
   * Perform keyword search
   */
  async keywordSearch(query: SearchQuery): Promise<SearchResults> {
    const must: any[] = [
      {
        multi_match: {
          query: query.text,
          fields: ['extractedText^2', 'fileName', 'tags', 'keywords'],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      },
    ];

    // Add filters
    if (query.patientId) {
      must.push({ term: { patientId: query.patientId } });
    }

    if (query.documentType) {
      must.push({ term: { documentType: query.documentType } });
    }

    if (query.dateRange) {
      must.push({
        range: {
          uploadTimestamp: {
            gte: query.dateRange.start.toISOString(),
            lte: query.dateRange.end.toISOString(),
          },
        },
      });
    }

    const response = await this.client.search({
      index: this.DOCUMENTS_INDEX,
      body: {
        query: {
          bool: {
            must,
          },
        },
        highlight: {
          fields: {
            extractedText: {
              fragment_size: 150,
              number_of_fragments: 3,
            },
          },
        },
        from: query.offset || 0,
        size: query.limit || 10,
      },
    });

    return this.formatSearchResults(response.body, 'keyword');
  }

  /**
   * Perform semantic search using vector embeddings
   */
  async semanticSearch(
    query: string,
    embeddingVector: number[],
    filters: Partial<SearchQuery> = {}
  ): Promise<SearchResults> {
    const filter: any[] = [];

    if (filters.patientId) {
      filter.push({ term: { patientId: filters.patientId } });
    }

    if (filters.documentType) {
      filter.push({ term: { documentType: filters.documentType } });
    }

    if (filters.dateRange) {
      filter.push({
        range: {
          uploadTimestamp: {
            gte: filters.dateRange.start.toISOString(),
            lte: filters.dateRange.end.toISOString(),
          },
        },
      });
    }

    const response = await this.client.search({
      index: this.DOCUMENTS_INDEX,
      body: {
        query: {
          bool: {
            must: [
              {
                knn: {
                  embeddingVector: {
                    vector: embeddingVector,
                    k: filters.limit || 10,
                  },
                },
              },
            ],
            filter,
          },
        },
        from: filters.offset || 0,
        size: filters.limit || 10,
      },
    });

    return this.formatSearchResults(response.body, 'semantic');
  }

  /**
   * Perform hybrid search (keyword + semantic)
   */
  async hybridSearch(
    textQuery: string,
    embeddingVector: number[],
    filters: Partial<SearchQuery> = {}
  ): Promise<SearchResults> {
    const filter: any[] = [];

    if (filters.patientId) {
      filter.push({ term: { patientId: filters.patientId } });
    }

    if (filters.documentType) {
      filter.push({ term: { documentType: filters.documentType } });
    }

    if (filters.dateRange) {
      filter.push({
        range: {
          uploadTimestamp: {
            gte: filters.dateRange.start.toISOString(),
            lte: filters.dateRange.end.toISOString(),
          },
        },
      });
    }

    // Hybrid search combines keyword and semantic search with weights
    const response = await this.client.search({
      index: this.DOCUMENTS_INDEX,
      body: {
        query: {
          bool: {
            should: [
              // Keyword search (40% weight)
              {
                multi_match: {
                  query: textQuery,
                  fields: ['extractedText^2', 'fileName', 'tags', 'keywords'],
                  type: 'best_fields',
                  fuzziness: 'AUTO',
                  boost: 0.4,
                },
              },
              // Semantic search (60% weight)
              {
                knn: {
                  embeddingVector: {
                    vector: embeddingVector,
                    k: filters.limit || 10,
                    boost: 0.6,
                  },
                },
              },
            ],
            filter,
            minimum_should_match: 1,
          },
        },
        highlight: {
          fields: {
            extractedText: {
              fragment_size: 150,
              number_of_fragments: 3,
            },
          },
        },
        from: filters.offset || 0,
        size: filters.limit || 10,
      },
    });

    return this.formatSearchResults(response.body, 'hybrid');
  }

  /**
   * Delete document from index
   */
  async deleteFromIndex(documentId: string): Promise<void> {
    try {
      await this.client.delete({
        index: this.DOCUMENTS_INDEX,
        id: documentId,
        refresh: true,
      });
    } catch (error: any) {
      if (error.meta?.statusCode !== 404) {
        throw error;
      }
      // Document not found in index, ignore
    }
  }

  /**
   * Reindex a document (update existing or create new)
   */
  async reindex(documentId: string, embeddingVector?: number[]): Promise<void> {
    // Fetch document from MongoDB
    const doc = await this.db
      .collection<MedicalDocument>('documents')
      .findOne({ documentId });

    if (!doc) {
      throw new Error(`Document ${documentId} not found in database`);
    }

    // Index in OpenSearch
    await this.indexDocument(doc, embeddingVector);
  }

  /**
   * Synchronize MongoDB with OpenSearch
   */
  async synchronizeIndex(patientId?: string): Promise<number> {
    const query = patientId ? { patientId } : {};
    const documents = await this.db
      .collection<MedicalDocument>('documents')
      .find(query)
      .toArray();

    let syncedCount = 0;

    for (const doc of documents) {
      try {
        await this.indexDocument(doc);
        syncedCount++;
      } catch (error) {
        console.error(`Failed to index document ${doc.documentId}:`, error);
      }
    }

    return syncedCount;
  }

  /**
   * Create documents index with mappings
   */
  private async createDocumentsIndex(): Promise<void> {
    const exists = await this.client.indices.exists({ index: this.DOCUMENTS_INDEX });

    if (exists.body) {
      return;
    }

    await this.client.indices.create({
      index: this.DOCUMENTS_INDEX,
      body: {
        mappings: {
          properties: {
            documentId: { type: 'keyword' },
            patientId: { type: 'keyword' },
            patientName: { type: 'text' },
            documentType: { type: 'keyword' },
            fhirResourceType: { type: 'keyword' },
            extractedText: { type: 'text' },
            medicalEntities: {
              properties: {
                conditions: { type: 'text' },
                medications: { type: 'text' },
                procedures: { type: 'text' },
                observations: { type: 'text' },
              },
            },
            embeddingVector: {
              type: 'knn_vector',
              dimension: 1536,
            },
            uploadTimestamp: { type: 'date' },
            uploadMethod: { type: 'keyword' },
            fileName: { type: 'text' },
            tags: { type: 'keyword' },
            keywords: { type: 'text' },
          },
        },
        settings: {
          'index.knn': true,
        },
      },
    });
  }

  /**
   * Create patients index with mappings
   */
  private async createPatientsIndex(): Promise<void> {
    const exists = await this.client.indices.exists({ index: this.PATIENTS_INDEX });

    if (exists.body) {
      return;
    }

    await this.client.indices.create({
      index: this.PATIENTS_INDEX,
      body: {
        mappings: {
          properties: {
            patientId: { type: 'keyword' },
            fullName: { type: 'text' },
            familyName: { type: 'text' },
            givenName: { type: 'text' },
            gender: { type: 'keyword' },
            birthDate: { type: 'date' },
            age: { type: 'integer' },
            city: { type: 'text' },
            state: { type: 'keyword' },
            postalCode: { type: 'keyword' },
            phone: { type: 'keyword' },
            email: { type: 'keyword' },
            active: { type: 'boolean' },
            identifierValues: { type: 'text' },
            embeddingVector: {
              type: 'knn_vector',
              dimension: 1536,
            },
            lastUpdated: { type: 'date' },
          },
        },
        settings: {
          'index.knn': true,
        },
      },
    });
  }

  /**
   * Create observations index with mappings
   */
  private async createObservationsIndex(): Promise<void> {
    const exists = await this.client.indices.exists({ index: this.OBSERVATIONS_INDEX });

    if (exists.body) {
      return;
    }

    await this.client.indices.create({
      index: this.OBSERVATIONS_INDEX,
      body: {
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
            },
          },
        },
        settings: {
          'index.knn': true,
        },
      },
    });
  }

  /**
   * Create conditions index with mappings
   */
  private async createConditionsIndex(): Promise<void> {
    const exists = await this.client.indices.exists({ index: this.CONDITIONS_INDEX });

    if (exists.body) {
      return;
    }

    await this.client.indices.create({
      index: this.CONDITIONS_INDEX,
      body: {
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
            },
          },
        },
        settings: {
          'index.knn': true,
        },
      },
    });
  }

  /**
   * Create medications index with mappings
   */
  private async createMedicationsIndex(): Promise<void> {
    const exists = await this.client.indices.exists({ index: this.MEDICATIONS_INDEX });

    if (exists.body) {
      return;
    }

    await this.client.indices.create({
      index: this.MEDICATIONS_INDEX,
      body: {
        mappings: {
          properties: {
            medicationId: { type: 'keyword' },
            patientId: { type: 'keyword' },
            patientName: { type: 'text' },
            medicationCode: { type: 'keyword' },
            medicationDisplay: { type: 'text' },
            dosageText: { type: 'text' },
            status: { type: 'keyword' },
            effectivePeriod: { type: 'date_range' },
            embeddingVector: {
              type: 'knn_vector',
              dimension: 1536,
            },
          },
        },
        settings: {
          'index.knn': true,
        },
      },
    });
  }

  /**
   * Format OpenSearch response to SearchResults
   */
  private formatSearchResults(response: any, searchMethod: 'keyword' | 'semantic' | 'hybrid'): SearchResults {
    const hits = response.hits.hits || [];

    const results: SearchResult[] = hits.map((hit: any) => {
      const highlights: string[] = [];
      if (hit.highlight?.extractedText) {
        highlights.push(...hit.highlight.extractedText);
      }

      const matchedFields: string[] = [];
      if (hit._explanation) {
        // Extract matched fields from explanation (if available)
        matchedFields.push('extractedText');
      }

      return {
        documentId: hit._source.documentId,
        patientId: hit._source.patientId,
        score: hit._score || 0,
        highlights,
        document: {
          documentId: hit._source.documentId,
          patientId: hit._source.patientId,
          documentType: hit._source.documentType,
          fhirResourceType: hit._source.fhirResourceType,
          uploadTimestamp: new Date(hit._source.uploadTimestamp),
          fileName: hit._source.fileName,
          tags: hit._source.tags,
        } as Partial<MedicalDocument>,
        metadata: {
          searchMethod,
          matchedFields,
        },
      };
    });

    return {
      results,
      total: response.hits.total?.value || 0,
      took: response.took || 0,
    };
  }

  /**
   * Extract keywords from text for indexing
   */
  private extractKeywords(text: string): string {
    // Simple keyword extraction - can be enhanced with NLP
    const words = text.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
    const keywords = words.filter((word) => word.length > 3 && !stopWords.has(word));
    return keywords.slice(0, 50).join(' '); // Limit to 50 keywords
  }
}
