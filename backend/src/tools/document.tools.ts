/**
 * Document Operation Tools for LangChain Agents
 * Provides tools for searching, creating, updating, and deleting medical documents
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { DocumentService, CreateDocumentDTO, UpdateDocumentDTO, DocumentFilters } from '../service/document.service.js';
import { SearchService, SearchQuery } from '../service/search.service.js';
import { EmbeddingService } from '../service/embedding.service.js';

/**
 * Create document operation tools
 */
export function createDocumentTools(
  documentService: DocumentService,
  searchService: SearchService,
  embeddingService: EmbeddingService
) {
  /**
   * Search Documents Tool
   * Searches for medical documents using keyword and semantic search
   */
  const searchDocumentsTool = tool(
    async ({ query, patientId, documentType, dateRange, limit }) => {
      try {
        // Build search query
        const searchQuery: SearchQuery = {
          text: query,
          patientId,
          documentType,
          limit: limit || 10,
        };

        if (dateRange) {
          searchQuery.dateRange = {
            start: new Date(dateRange.start),
            end: new Date(dateRange.end),
          };
        }

        // Perform keyword search
        const results = await searchService.keywordSearch(searchQuery);

        // Format results for agent
        const formattedResults = results.results.map((result) => ({
          documentId: result.documentId,
          patientId: result.patientId,
          documentType: result.document.documentType,
          fileName: result.document.fileName,
          uploadDate: result.document.uploadTimestamp,
          score: result.score,
          highlights: result.highlights,
          tags: result.document.tags,
        }));

        return JSON.stringify({
          success: true,
          total: results.total,
          results: formattedResults,
          message: `Found ${results.total} documents matching "${query}"`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to search documents: ${error.message}`,
        });
      }
    },
    {
      name: 'search_documents',
      description: 'Search for medical documents using keyword search. Use this to find documents by content, filename, or tags. Returns document metadata and highlights.',
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
   * Get Document Tool
   * Retrieves a specific document by ID
   */
  const getDocumentTool = tool(
    async ({ documentId, userId }) => {
      try {
        const document = await documentService.getDocument(documentId, userId);

        if (!document) {
          return JSON.stringify({
            success: false,
            message: `Document ${documentId} not found`,
          });
        }

        // Return document details (excluding encrypted fields for security)
        return JSON.stringify({
          success: true,
          document: {
            documentId: document.documentId,
            patientId: document.patientId,
            documentType: document.documentType,
            fhirResourceType: document.fhirResourceType,
            uploadTimestamp: document.uploadTimestamp,
            uploadMethod: document.uploadMethod,
            fileName: document.fileName,
            fileSize: document.fileSize,
            mimeType: document.mimeType,
            tags: document.tags,
            metadata: document.metadata,
            version: document.version,
            lastModified: document.lastModified,
            extractedText: document.extractedText?.substring(0, 500), // First 500 chars
            fhirResource: document.fhirResource,
          },
          message: `Retrieved document ${documentId}`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to retrieve document: ${error.message}`,
        });
      }
    },
    {
      name: 'get_document',
      description: 'Retrieve a specific medical document by its ID. Returns full document details including content, metadata, and audit information.',
      schema: z.object({
        documentId: z.string().describe('The unique document identifier'),
        userId: z.string().describe('The user requesting the document'),
      }),
    }
  );

  /**
   * Create Document Tool
   * Creates a new medical document
   */
  const createDocumentTool = tool(
    async ({
      patientId,
      documentType,
      uploadMethod,
      userId,
      fhirResourceType,
      fhirResource,
      extractedText,
      fileName,
      fileSize,
      mimeType,
      tags,
      metadata,
    }) => {
      try {
        const dto: CreateDocumentDTO = {
          patientId,
          documentType,
          uploadMethod,
          userId,
          fhirResourceType,
          fhirResource,
          extractedText,
          fileName,
          fileSize,
          mimeType,
          tags: tags || [],
          metadata: metadata || {},
        };

        const document = await documentService.createDocument(dto);

        // Generate embedding and index in OpenSearch
        if (extractedText) {
          const embedding = await embeddingService.generateEmbedding(extractedText);
          await searchService.indexDocument(document, embedding);
        } else {
          await searchService.indexDocument(document);
        }

        return JSON.stringify({
          success: true,
          documentId: document.documentId,
          message: `Successfully created document ${document.documentId}`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to create document: ${error.message}`,
        });
      }
    },
    {
      name: 'create_document',
      description: 'Create a new medical document. Use this to store FHIR resources, clinical notes, or other medical documents. The document will be encrypted and indexed for search.',
      schema: z.object({
        patientId: z.string().describe('The patient this document belongs to'),
        documentType: z
          .enum(['fhir', 'pdf', 'text', 'markdown'])
          .describe('Type of document'),
        uploadMethod: z
          .enum(['naturalLanguage', 'fileUpload'])
          .describe('How the document was uploaded'),
        userId: z.string().describe('The user creating the document'),
        fhirResourceType: z.string().optional().describe('FHIR resource type (for FHIR documents)'),
        fhirResource: z.any().optional().describe('FHIR resource object (for FHIR documents)'),
        extractedText: z.string().optional().describe('Extracted text content'),
        fileName: z.string().optional().describe('Original filename'),
        fileSize: z.number().optional().describe('File size in bytes'),
        mimeType: z.string().optional().describe('MIME type'),
        tags: z.array(z.string()).optional().describe('Document tags'),
        metadata: z.record(z.any()).optional().describe('Additional metadata'),
      }),
    }
  );

  /**
   * Update Document Tool
   * Updates an existing medical document
   */
  const updateDocumentTool = tool(
    async ({
      documentId,
      userId,
      fhirResource,
      extractedText,
      structuredData,
      metadata,
      tags,
    }) => {
      try {
        const updates: UpdateDocumentDTO = {
          userId,
          fhirResource,
          extractedText,
          structuredData,
          metadata,
          tags,
        };

        const updatedDocument = await documentService.updateDocument(documentId, updates);

        if (!updatedDocument) {
          return JSON.stringify({
            success: false,
            message: `Document ${documentId} not found`,
          });
        }

        // Re-index in OpenSearch if content changed
        if (extractedText) {
          const embedding = await embeddingService.generateEmbedding(extractedText);
          await searchService.reindex(documentId, embedding);
        } else {
          await searchService.reindex(documentId);
        }

        return JSON.stringify({
          success: true,
          documentId: updatedDocument.documentId,
          version: updatedDocument.version,
          message: `Successfully updated document ${documentId}`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to update document: ${error.message}`,
        });
      }
    },
    {
      name: 'update_document',
      description: 'Update an existing medical document. Use this to modify document content, metadata, or tags. Creates a new version and maintains audit trail.',
      schema: z.object({
        documentId: z.string().describe('The document to update'),
        userId: z.string().describe('The user making the update'),
        fhirResource: z.any().optional().describe('Updated FHIR resource'),
        extractedText: z.string().optional().describe('Updated text content'),
        structuredData: z.any().optional().describe('Updated structured data'),
        metadata: z.record(z.any()).optional().describe('Updated metadata'),
        tags: z.array(z.string()).optional().describe('Updated tags'),
      }),
    }
  );

  /**
   * Delete Document Tool
   * Deletes a medical document
   */
  const deleteDocumentTool = tool(
    async ({ documentId, userId }) => {
      try {
        const deleted = await documentService.deleteDocument(documentId, userId);

        if (!deleted) {
          return JSON.stringify({
            success: false,
            message: `Document ${documentId} not found`,
          });
        }

        // Remove from OpenSearch index
        await searchService.deleteFromIndex(documentId);

        return JSON.stringify({
          success: true,
          documentId,
          message: `Successfully deleted document ${documentId}`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to delete document: ${error.message}`,
        });
      }
    },
    {
      name: 'delete_document',
      description: 'Delete a medical document permanently. This action is irreversible and will remove the document from both storage and search index. An audit log entry will be created.',
      schema: z.object({
        documentId: z.string().describe('The document to delete'),
        userId: z.string().describe('The user requesting deletion'),
      }),
    }
  );

  return {
    searchDocumentsTool,
    getDocumentTool,
    createDocumentTool,
    updateDocumentTool,
    deleteDocumentTool,
  };
}
