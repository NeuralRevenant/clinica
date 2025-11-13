/**
 * Search Operation Tools for LangChain Agents
 * Provides tools for semantic and hybrid search across medical documents
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { SearchService, SearchQuery } from '../service/search.service.js';
import { EmbeddingService } from '../service/embedding.service.js';

/**
 * Create search operation tools
 */
export function createSearchTools(
  searchService: SearchService,
  embeddingService: EmbeddingService
) {
  /**
   * Semantic Search Tool
   * Performs vector-based semantic search using embeddings
   */
  const semanticSearchTool = tool(
    async ({ query, patientId, documentType, dateRange, limit }) => {
      try {
        // Generate embedding for query
        const embedding = await embeddingService.generateEmbedding(query);

        // Build filters
        const filters: Partial<SearchQuery> = {
          patientId,
          documentType,
          limit: limit || 10,
        };

        if (dateRange) {
          filters.dateRange = {
            start: new Date(dateRange.start),
            end: new Date(dateRange.end),
          };
        }

        // Perform semantic search
        const results = await searchService.semanticSearch(query, embedding, filters);

        // Format results for agent
        const formattedResults = results.results.map((result) => ({
          documentId: result.documentId,
          patientId: result.patientId,
          documentType: result.document.documentType,
          fileName: result.document.fileName,
          uploadDate: result.document.uploadTimestamp,
          score: result.score,
          tags: result.document.tags,
          fhirResourceType: result.document.fhirResourceType,
        }));

        return JSON.stringify({
          success: true,
          searchMethod: 'semantic',
          total: results.total,
          results: formattedResults,
          took: results.took,
          message: `Found ${results.total} documents using semantic search for "${query}"`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Semantic search failed: ${error.message}`,
        });
      }
    },
    {
      name: 'semantic_search',
      description: 'Perform semantic search using vector embeddings. This finds documents based on meaning and context, not just keywords. Best for finding conceptually related documents even if they use different terminology.',
      schema: z.object({
        query: z.string().describe('The search query text'),
        patientId: z.string().optional().describe('Filter by patient ID'),
        documentType: z
          .enum(['fhir', 'pdf', 'text', 'markdown'])
          .optional()
          .describe('Filter by document type'),
        dateRange: z
          .object({
            start: z.string().describe('Start date in ISO format'),
            end: z.string().describe('End date in ISO format'),
          })
          .optional()
          .describe('Filter by upload date range'),
        limit: z.number().optional().describe('Maximum number of results (default: 10)'),
      }),
    }
  );

  /**
   * Hybrid Search Tool
   * Combines keyword and semantic search for best results
   */
  const hybridSearchTool = tool(
    async ({ query, patientId, documentType, dateRange, limit }) => {
      try {
        // Generate embedding for query
        const embedding = await embeddingService.generateEmbedding(query);

        // Build filters
        const filters: Partial<SearchQuery> = {
          patientId,
          documentType,
          limit: limit || 10,
        };

        if (dateRange) {
          filters.dateRange = {
            start: new Date(dateRange.start),
            end: new Date(dateRange.end),
          };
        }

        // Perform hybrid search
        const results = await searchService.hybridSearch(query, embedding, filters);

        // Format results for agent with highlights
        const formattedResults = results.results.map((result) => ({
          documentId: result.documentId,
          patientId: result.patientId,
          documentType: result.document.documentType,
          fileName: result.document.fileName,
          uploadDate: result.document.uploadTimestamp,
          score: result.score,
          highlights: result.highlights,
          tags: result.document.tags,
          fhirResourceType: result.document.fhirResourceType,
        }));

        return JSON.stringify({
          success: true,
          searchMethod: 'hybrid',
          total: results.total,
          results: formattedResults,
          took: results.took,
          message: `Found ${results.total} documents using hybrid search for "${query}"`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Hybrid search failed: ${error.message}`,
        });
      }
    },
    {
      name: 'hybrid_search',
      description: 'Perform hybrid search combining keyword matching and semantic similarity. This provides the best of both worlds - finds exact matches and conceptually similar documents. Recommended for most search queries.',
      schema: z.object({
        query: z.string().describe('The search query text'),
        patientId: z.string().optional().describe('Filter by patient ID'),
        documentType: z
          .enum(['fhir', 'pdf', 'text', 'markdown'])
          .optional()
          .describe('Filter by document type'),
        dateRange: z
          .object({
            start: z.string().describe('Start date in ISO format'),
            end: z.string().describe('End date in ISO format'),
          })
          .optional()
          .describe('Filter by upload date range'),
        limit: z.number().optional().describe('Maximum number of results (default: 10)'),
      }),
    }
  );

  /**
   * Advanced Search Tool
   * Provides more control over search parameters and ranking
   */
  const advancedSearchTool = tool(
    async ({
      query,
      patientId,
      documentType,
      dateRange,
      tags,
      fhirResourceType,
      limit,
      searchMethod,
    }) => {
      try {
        // Build filters
        const filters: Partial<SearchQuery> = {
          patientId,
          documentType,
          limit: limit || 10,
        };

        if (dateRange) {
          filters.dateRange = {
            start: new Date(dateRange.start),
            end: new Date(dateRange.end),
          };
        }

        let results;

        // Choose search method
        if (searchMethod === 'semantic') {
          const embedding = await embeddingService.generateEmbedding(query);
          results = await searchService.semanticSearch(query, embedding, filters);
        } else if (searchMethod === 'hybrid') {
          const embedding = await embeddingService.generateEmbedding(query);
          results = await searchService.hybridSearch(query, embedding, filters);
        } else {
          // Default to keyword search
          const searchQuery: SearchQuery = {
            text: query,
            ...filters,
          };
          results = await searchService.keywordSearch(searchQuery);
        }

        // Apply additional filters
        let filteredResults = results.results;

        if (tags && tags.length > 0) {
          filteredResults = filteredResults.filter((result) =>
            tags.some((tag) => result.document.tags?.includes(tag))
          );
        }

        if (fhirResourceType) {
          filteredResults = filteredResults.filter(
            (result) => result.document.fhirResourceType === fhirResourceType
          );
        }

        // Format results
        const formattedResults = filteredResults.map((result) => ({
          documentId: result.documentId,
          patientId: result.patientId,
          documentType: result.document.documentType,
          fileName: result.document.fileName,
          uploadDate: result.document.uploadTimestamp,
          score: result.score,
          highlights: result.highlights,
          tags: result.document.tags,
          fhirResourceType: result.document.fhirResourceType,
        }));

        return JSON.stringify({
          success: true,
          searchMethod: searchMethod || 'keyword',
          total: filteredResults.length,
          results: formattedResults,
          took: results.took,
          message: `Found ${filteredResults.length} documents matching advanced search criteria`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Advanced search failed: ${error.message}`,
        });
      }
    },
    {
      name: 'advanced_search',
      description: 'Perform advanced search with fine-grained control over filters and search method. Use this when you need to search with specific tags, FHIR resource types, or want to control the search algorithm.',
      schema: z.object({
        query: z.string().describe('The search query text'),
        patientId: z.string().optional().describe('Filter by patient ID'),
        documentType: z
          .enum(['fhir', 'pdf', 'text', 'markdown'])
          .optional()
          .describe('Filter by document type'),
        dateRange: z
          .object({
            start: z.string().describe('Start date in ISO format'),
            end: z.string().describe('End date in ISO format'),
          })
          .optional()
          .describe('Filter by upload date range'),
        tags: z.array(z.string()).optional().describe('Filter by document tags'),
        fhirResourceType: z.string().optional().describe('Filter by FHIR resource type'),
        limit: z.number().optional().describe('Maximum number of results (default: 10)'),
        searchMethod: z
          .enum(['keyword', 'semantic', 'hybrid'])
          .optional()
          .describe('Search method to use (default: keyword)'),
      }),
    }
  );

  /**
   * Search Similar Documents Tool
   * Finds documents similar to a given document
   */
  const searchSimilarDocumentsTool = tool(
    async ({ documentId, userId, limit }) => {
      try {
        // Get the source document
        const { DocumentService } = await import('../service/document.service.js');
        const { Db } = await import('mongodb');
        
        // Note: This is a simplified version. In production, you'd inject DocumentService
        // For now, we'll return a placeholder response
        return JSON.stringify({
          success: false,
          message: 'Similar document search requires document service integration',
          note: 'This tool needs to be called with proper service injection',
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to find similar documents: ${error.message}`,
        });
      }
    },
    {
      name: 'search_similar_documents',
      description: 'Find documents similar to a given document using semantic similarity. Use this to discover related medical records or documents with similar content.',
      schema: z.object({
        documentId: z.string().describe('The document ID to find similar documents for'),
        userId: z.string().describe('The user requesting the search'),
        limit: z.number().optional().describe('Maximum number of similar documents (default: 10)'),
      }),
    }
  );

  return {
    semanticSearchTool,
    hybridSearchTool,
    advancedSearchTool,
    searchSimilarDocumentsTool,
  };
}
