import { OpenAIEmbeddings } from '@langchain/openai';
import Redis from 'ioredis';
import crypto from 'crypto';

/**
 * Embedding Service - Generates vector embeddings using OpenAI
 * Implements caching with Redis for performance optimization
 */
export class EmbeddingService {
  private embeddings: OpenAIEmbeddings;
  private redis: Redis;
  private readonly CACHE_PREFIX = 'embedding:';
  private readonly CACHE_TTL = 86400 * 7; // 7 days in seconds
  private readonly EMBEDDING_MODEL = 'text-embedding-ada-002';
  private readonly EMBEDDING_DIMENSION = 1536;

  constructor(openaiApiKey: string, redis: Redis) {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: openaiApiKey,
      modelName: this.EMBEDDING_MODEL,
    });
    this.redis = redis;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    // Check cache first
    const cacheKey = this.getCacheKey(text);
    const cached = await this.getFromCache(cacheKey);

    if (cached) {
      return cached;
    }

    // Generate embedding
    const embedding = await this.embeddings.embedQuery(text);

    // Cache the result
    await this.saveToCache(cacheKey, embedding);

    return embedding;
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    // Filter out empty texts
    const validTexts = texts.filter((text) => text && text.trim().length > 0);

    if (validTexts.length === 0) {
      return [];
    }

    // Check cache for each text
    const results: (number[] | null)[] = [];
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    for (let i = 0; i < validTexts.length; i++) {
      const text = validTexts[i];
      const cacheKey = this.getCacheKey(text);
      const cached = await this.getFromCache(cacheKey);

      if (cached) {
        results[i] = cached;
      } else {
        results[i] = null;
        uncachedIndices.push(i);
        uncachedTexts.push(text);
      }
    }

    // Generate embeddings for uncached texts
    if (uncachedTexts.length > 0) {
      const newEmbeddings = await this.embeddings.embedDocuments(uncachedTexts);

      // Fill in results and cache
      for (let i = 0; i < uncachedIndices.length; i++) {
        const index = uncachedIndices[i];
        const embedding = newEmbeddings[i];
        results[index] = embedding;

        // Cache the result
        const cacheKey = this.getCacheKey(uncachedTexts[i]);
        await this.saveToCache(cacheKey, embedding);
      }
    }

    return results as number[][];
  }

  /**
   * Generate embedding for document text with chunking for long texts
   */
  async generateDocumentEmbedding(text: string, maxChunkSize: number = 8000): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    // If text is short enough, generate embedding directly
    if (text.length <= maxChunkSize) {
      return this.generateEmbedding(text);
    }

    // Split into chunks and generate embeddings
    const chunks = this.chunkText(text, maxChunkSize);
    const chunkEmbeddings = await this.generateBatchEmbeddings(chunks);

    // Average the embeddings
    return this.averageEmbeddings(chunkEmbeddings);
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Clear embedding cache for a specific text
   */
  async clearCache(text: string): Promise<void> {
    const cacheKey = this.getCacheKey(text);
    await this.redis.del(cacheKey);
  }

  /**
   * Clear all embedding cache
   */
  async clearAllCache(): Promise<void> {
    const keys = await this.redis.keys(`${this.CACHE_PREFIX}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{ totalKeys: number; memoryUsage: string }> {
    const keys = await this.redis.keys(`${this.CACHE_PREFIX}*`);
    const info = await this.redis.info('memory');
    const memoryMatch = info.match(/used_memory_human:(.+)/);
    const memoryUsage = memoryMatch ? memoryMatch[1].trim() : 'unknown';

    return {
      totalKeys: keys.length,
      memoryUsage,
    };
  }

  /**
   * Generate cache key from text
   */
  private getCacheKey(text: string): string {
    // Use hash of text as cache key to handle long texts
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    return `${this.CACHE_PREFIX}${hash}`;
  }

  /**
   * Get embedding from cache
   */
  private async getFromCache(key: string): Promise<number[] | null> {
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Error reading from cache:', error);
    }
    return null;
  }

  /**
   * Save embedding to cache
   */
  private async saveToCache(key: string, embedding: number[]): Promise<void> {
    try {
      await this.redis.setex(key, this.CACHE_TTL, JSON.stringify(embedding));
    } catch (error) {
      console.error('Error saving to cache:', error);
    }
  }

  /**
   * Chunk text into smaller pieces
   */
  private chunkText(text: string, maxChunkSize: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    // Split by sentences (simple approach)
    const sentences = text.split(/[.!?]+/);

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length <= maxChunkSize) {
        currentChunk += sentence + '. ';
      } else {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence + '. ';
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Average multiple embeddings into one
   */
  private averageEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) {
      throw new Error('Cannot average empty embeddings array');
    }

    if (embeddings.length === 1) {
      return embeddings[0];
    }

    const dimension = embeddings[0].length;
    const averaged = new Array(dimension).fill(0);

    for (const embedding of embeddings) {
      for (let i = 0; i < dimension; i++) {
        averaged[i] += embedding[i];
      }
    }

    for (let i = 0; i < dimension; i++) {
      averaged[i] /= embeddings.length;
    }

    return averaged;
  }

  /**
   * Get embedding dimension
   */
  getEmbeddingDimension(): number {
    return this.EMBEDDING_DIMENSION;
  }

  /**
   * Get embedding model name
   */
  getModelName(): string {
    return this.EMBEDDING_MODEL;
  }
}
