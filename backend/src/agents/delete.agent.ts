/**
 * Delete Agent
 * Handles document deletion through natural language or direct ID
 * 
 * Responsibilities:
 * - Identify document to delete from natural language or direct ID
 * - Remove from MongoDB
 * - Remove from OpenSearch index
 * - Create audit log entry
 * - Handle cascading deletes if needed
 * - Reason about delete safety and implications
 * - Confirm destructive operations
 */

import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DocumentService } from '../service/document.service.js';
import { SearchService } from '../service/search.service.js';

/**
 * Delete Agent Configuration
 */
export interface DeleteAgentConfig {
  documentService: DocumentService;
  searchService: SearchService;
  openaiApiKey: string;
  model?: string;
  temperature?: number;
}

/**
 * Delete Result
 */
export interface DeleteResult {
  success: boolean;
  documentId?: string;
  documentIds?: string[];
  message: string;
  auditLogId?: string;
  reasoning?: string;
  requiresConfirmation?: boolean;
  deleteImpact?: DeleteImpact;
}

/**
 * Delete Impact Assessment
 */
export interface DeleteImpact {
  affectedDocuments: string[];
  documentCount: number;
  risks: string[];
  requiresConfirmation: boolean;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Delete Agent
 */
export class DeleteAgent {
  private llm: ChatOpenAI;
  private documentService: DocumentService;
  private searchService: SearchService;

  constructor(config: DeleteAgentConfig) {
    this.documentService = config.documentService;
    this.searchService = config.searchService;

    // Initialize LLM
    this.llm = new ChatOpenAI({
      modelName: config.model || 'gpt-4',
      temperature: config.temperature || 0,
      openAIApiKey: config.openaiApiKey,
    });
  }

  /**
   * System prompt for delete agent
   */
  private getSystemPrompt(): string {
    return `You are a Delete Agent specialized in safely removing medical documents.

Your responsibilities:
1. Identify the target document(s) to delete from natural language instructions
2. Assess the impact of deletion
3. Identify any risks or dependencies
4. Request confirmation for:
   - Bulk deletes (multiple documents)
   - Critical medical documents
   - Recent documents (< 7 days old)
5. Execute deletion from database and search index
6. Create audit log entries

Guidelines:
- Always identify the target document(s) first using search
- Assess the impact before deleting
- Request confirmation for:
  - Bulk deletes (> 1 document)
  - FHIR resources with critical data
  - Documents uploaded recently
- Explain what will be deleted and why
- Provide clear reasoning for your decisions
- If instructions are ambiguous, ask for clarification
- Never delete without proper identification

Available tools:
- search_documents: Find documents to delete
- get_document: Retrieve document details
- assess_delete_impact: Evaluate deletion impact
- delete_document: Delete a single document
- bulk_delete: Delete multiple documents

Remember: Deletion is permanent. Always be cautious and request confirmation when appropriate.`;
  }

  /**
   * Create agent-specific tools
   */
  private createTools() {
    const searchDocumentsTool = tool(
      async ({ query, patientId, documentType, dateRange }) => {
        try {
          const searchQuery: any = {
            text: query,
            patientId,
            documentType,
            limit: 50, // Higher limit for bulk operations
          };

          if (dateRange) {
            searchQuery.dateRange = {
              start: new Date(dateRange.start),
              end: new Date(dateRange.end),
            };
          }

          const results = await this.searchService.keywordSearch(searchQuery);

          const formattedResults = results.results.map((result) => ({
            documentId: result.documentId,
            patientId: result.patientId,
            documentType: result.document.documentType,
            fileName: result.document.fileName,
            uploadDate: result.document.uploadTimestamp,
            fhirResourceType: result.document.fhirResourceType,
            score: result.score,
          }));

          return JSON.stringify({
            success: true,
            total: results.total,
            results: formattedResults,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'search_documents',
        description: 'Search for documents to delete. Use this to find target documents based on natural language description.',
        schema: z.object({
          query: z.string().describe('Search query to find documents'),
          patientId: z.string().optional().describe('Patient ID filter'),
          documentType: z.enum(['fhir', 'pdf', 'text', 'markdown']).optional().describe('Document type filter'),
          dateRange: z
            .object({
              start: z.string().describe('Start date in ISO format'),
              end: z.string().describe('End date in ISO format'),
            })
            .optional()
            .describe('Date range filter'),
        }),
      }
    );

    const getDocumentTool = tool(
      async ({ documentId, userId }) => {
        try {
          const document = await this.documentService.getDocument(documentId, userId);

          if (!document) {
            return JSON.stringify({
              success: false,
              message: 'Document not found',
            });
          }

          return JSON.stringify({
            success: true,
            document: {
              documentId: document.documentId,
              patientId: document.patientId,
              documentType: document.documentType,
              fhirResourceType: document.fhirResourceType,
              fileName: document.fileName,
              uploadTimestamp: document.uploadTimestamp,
              uploadMethod: document.uploadMethod,
              tags: document.tags,
              version: document.version,
            },
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'get_document',
        description: 'Retrieve document details. Use this to get information about a document before deleting it.',
        schema: z.object({
          documentId: z.string().describe('The document ID'),
          userId: z.string().describe('The user requesting the document'),
        }),
      }
    );

    const assessDeleteImpactTool = tool(
      async ({ documentIds, documentTypes, uploadDates }) => {
        try {
          const risks: string[] = [];
          let severity: 'low' | 'medium' | 'high' = 'low';
          let requiresConfirmation = false;

          // Assess based on count
          if (documentIds.length > 1) {
            risks.push(`Bulk delete operation affecting ${documentIds.length} documents`);
            severity = 'medium';
            requiresConfirmation = true;
          }

          if (documentIds.length > 10) {
            risks.push('Large bulk delete operation');
            severity = 'high';
          }

          // Assess based on document types
          if (documentTypes.includes('fhir')) {
            risks.push('Deleting FHIR resources may affect clinical data integrity');
            severity = severity === 'low' ? 'medium' : 'high';
            requiresConfirmation = true;
          }

          // Assess based on upload dates
          const now = new Date();
          const recentThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days
          
          for (const dateStr of uploadDates) {
            const uploadDate = new Date(dateStr);
            if (now.getTime() - uploadDate.getTime() < recentThreshold) {
              risks.push('Deleting recently uploaded documents');
              requiresConfirmation = true;
              break;
            }
          }

          return JSON.stringify({
            success: true,
            impact: {
              affectedDocuments: documentIds,
              documentCount: documentIds.length,
              risks,
              requiresConfirmation,
              severity,
            },
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'assess_delete_impact',
        description: 'Assess the impact of deleting documents. Use this to determine if confirmation is needed.',
        schema: z.object({
          documentIds: z.array(z.string()).describe('Document IDs to delete'),
          documentTypes: z.array(z.string()).describe('Types of documents being deleted'),
          uploadDates: z.array(z.string()).describe('Upload dates of documents'),
        }),
      }
    );

    const deleteDocumentTool = tool(
      async ({ documentId, userId, confirmed }) => {
        try {
          if (!confirmed) {
            return JSON.stringify({
              success: false,
              message: 'Deletion requires confirmation',
              requiresConfirmation: true,
            });
          }

          const deleted = await this.documentService.deleteDocument(documentId, userId);

          if (!deleted) {
            return JSON.stringify({
              success: false,
              message: 'Document not found',
            });
          }

          // Remove from search index
          await this.searchService.deleteFromIndex(documentId);

          return JSON.stringify({
            success: true,
            documentId,
            message: 'Document deleted successfully',
            auditLogId: new Date().toISOString(), // Simplified audit log ID
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'delete_document',
        description: 'Delete a single document. This is permanent and cannot be undone.',
        schema: z.object({
          documentId: z.string().describe('The document to delete'),
          userId: z.string().describe('The user requesting deletion'),
          confirmed: z.boolean().describe('Whether user confirmed the deletion'),
        }),
      }
    );

    const bulkDeleteTool = tool(
      async ({ documentIds, userId, confirmed }) => {
        try {
          if (!confirmed) {
            return JSON.stringify({
              success: false,
              message: 'Bulk deletion requires confirmation',
              requiresConfirmation: true,
            });
          }

          const results = {
            deleted: [] as string[],
            failed: [] as string[],
          };

          for (const documentId of documentIds) {
            try {
              const deleted = await this.documentService.deleteDocument(documentId, userId);
              if (deleted) {
                await this.searchService.deleteFromIndex(documentId);
                results.deleted.push(documentId);
              } else {
                results.failed.push(documentId);
              }
            } catch (error) {
              results.failed.push(documentId);
            }
          }

          return JSON.stringify({
            success: results.deleted.length > 0,
            deletedCount: results.deleted.length,
            failedCount: results.failed.length,
            deleted: results.deleted,
            failed: results.failed,
            message: `Deleted ${results.deleted.length} documents, ${results.failed.length} failed`,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'bulk_delete',
        description: 'Delete multiple documents at once. This is permanent and cannot be undone.',
        schema: z.object({
          documentIds: z.array(z.string()).describe('Document IDs to delete'),
          userId: z.string().describe('The user requesting deletion'),
          confirmed: z.boolean().describe('Whether user confirmed the bulk deletion'),
        }),
      }
    );

    return [
      searchDocumentsTool,
      getDocumentTool,
      assessDeleteImpactTool,
      deleteDocumentTool,
      bulkDeleteTool,
    ];
  }

  /**
   * Process natural language delete
   */
  async processNaturalLanguageDelete(
    instruction: string,
    patientId: string,
    userId: string,
    confirmed: boolean = false
  ): Promise<DeleteResult> {
    try {
      const tools = this.createTools();
      
      // Create messages
      const messages = [
        new SystemMessage(this.getSystemPrompt()),
        new HumanMessage(
          `Process this delete instruction:

Patient ID: ${patientId}
User ID: ${userId}
User Confirmed: ${confirmed}

Instruction: ${instruction}

Please:
1. Search for the target document(s)
2. Retrieve document details
3. Assess the impact of deletion
4. If high risk and not confirmed, request confirmation
5. If confirmed or low risk, execute the deletion
6. Provide a summary of what was deleted

Be careful and thorough. Explain your reasoning.`
        ),
      ];

      // Bind tools to LLM
      const llmWithTools = this.llm.bindTools(tools);

      // Invoke with reasoning loop
      let currentMessages = [...messages];
      let iterations = 0;
      const maxIterations = 10;
      let finalResponse = '';
      const reasoning: string[] = [];
      let documentIds: string[] = [];
      let requiresConfirmation = false;
      let deleteImpact: DeleteImpact | undefined;

      while (iterations < maxIterations) {
        iterations++;

        const response = await llmWithTools.invoke(currentMessages);
        currentMessages.push(response);

        if (response.tool_calls && response.tool_calls.length > 0) {
          for (const toolCall of response.tool_calls) {
            const tool = tools.find((t) => t.name === toolCall.name);
            if (tool) {
              const result = await tool.invoke(toolCall.args);
              
              currentMessages.push({
                role: 'tool',
                content: result,
                tool_call_id: toolCall.id,
              } as any);

              reasoning.push(`Tool: ${toolCall.name}`);
              
              // Extract information from tool results
              try {
                const resultObj = JSON.parse(result);
                
                if (resultObj.documentId) {
                  documentIds.push(resultObj.documentId);
                }
                
                if (resultObj.deleted) {
                  documentIds.push(...resultObj.deleted);
                }
                
                if (resultObj.impact) {
                  deleteImpact = resultObj.impact;
                  requiresConfirmation = resultObj.impact.requiresConfirmation;
                }
                
                if (resultObj.requiresConfirmation) {
                  requiresConfirmation = true;
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        } else {
          finalResponse = response.content as string;
          break;
        }
      }

      // Check if confirmation is needed but not provided
      if (requiresConfirmation && !confirmed) {
        return {
          success: false,
          documentIds,
          message: 'This deletion requires confirmation. Please review and confirm.',
          requiresConfirmation: true,
          deleteImpact,
          reasoning: reasoning.join('\n'),
        };
      }

      return {
        success: documentIds.length > 0,
        documentIds,
        documentId: documentIds[0],
        message: finalResponse || `Deleted ${documentIds.length} document(s) successfully`,
        reasoning: reasoning.join('\n'),
        deleteImpact,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Delete failed: ${error.message}`,
        reasoning: error.stack,
      };
    }
  }

  /**
   * Process direct delete
   */
  async processDirectDelete(
    documentId: string,
    userId: string,
    confirmed: boolean = false
  ): Promise<DeleteResult> {
    try {
      // Get document details first
      const document = await this.documentService.getDocument(documentId, userId);

      if (!document) {
        return {
          success: false,
          message: 'Document not found',
        };
      }

      // Assess impact
      const impact = await this.assessDeleteImpact([documentId]);

      // Check if confirmation needed
      if (impact.requiresConfirmation && !confirmed) {
        return {
          success: false,
          documentId,
          message: 'This deletion requires confirmation',
          requiresConfirmation: true,
          deleteImpact: impact,
        };
      }

      // Delete document
      const deleted = await this.documentService.deleteDocument(documentId, userId);

      if (!deleted) {
        return {
          success: false,
          message: 'Failed to delete document',
        };
      }

      // Remove from search index
      await this.searchService.deleteFromIndex(documentId);

      return {
        success: true,
        documentId,
        message: 'Document deleted successfully',
        auditLogId: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Direct delete failed: ${error.message}`,
      };
    }
  }

  /**
   * Assess delete impact
   */
  async assessDeleteImpact(documentIds: string[]): Promise<DeleteImpact> {
    const risks: string[] = [];
    let severity: 'low' | 'medium' | 'high' = 'low';
    let requiresConfirmation = false;

    // Assess based on count
    if (documentIds.length > 1) {
      risks.push(`Bulk delete operation affecting ${documentIds.length} documents`);
      severity = 'medium';
      requiresConfirmation = true;
    }

    if (documentIds.length > 10) {
      risks.push('Large bulk delete operation');
      severity = 'high';
    }

    return {
      affectedDocuments: documentIds,
      documentCount: documentIds.length,
      risks,
      requiresConfirmation,
      severity,
    };
  }

  /**
   * Identify target document
   */
  async identifyTargetDocument(
    instruction: string,
    patientId: string
  ): Promise<any> {
    const results = await this.searchService.keywordSearch({
      text: instruction,
      patientId,
      limit: 10,
    });

    return results.results[0]?.document;
  }
}
