/**
 * Edit Agent
 * Handles document editing through natural language or structured updates
 * 
 * Responsibilities:
 * - Identify target document and fields to modify
 * - Validate edits against FHIR schema (if applicable)
 * - Update document in MongoDB
 * - Re-index in OpenSearch
 * - Maintain audit log
 * - Support both natural language and structured edits
 * - Reason about edit intent and safety
 * - Validate changes before committing
 */

import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DocumentService, UpdateDocumentDTO } from '../service/document.service.js';
import { FHIRService } from '../service/fhir.service.js';
import { SearchService } from '../service/search.service.js';
import { EmbeddingService } from '../service/embedding.service.js';

/**
 * Edit Agent Configuration
 */
export interface EditAgentConfig {
  documentService: DocumentService;
  fhirService: FHIRService;
  searchService: SearchService;
  embeddingService: EmbeddingService;
  openaiApiKey: string;
  model?: string;
  temperature?: number;
}

/**
 * Edit Result
 */
export interface EditResult {
  success: boolean;
  documentId?: string;
  fieldsModified?: string[];
  message: string;
  auditLogId?: string;
  reasoning?: string;
  validationWarnings?: string[];
  requiresConfirmation?: boolean;
  changePreview?: ChangePreview;
}

/**
 * Change Preview
 */
export interface ChangePreview {
  before: any;
  after: any;
  risks: string[];
  requiresConfirmation: boolean;
}

/**
 * Edit Agent
 */
export class EditAgent {
  private llm: ChatOpenAI;
  private documentService: DocumentService;
  private fhirService: FHIRService;
  private searchService: SearchService;
  private embeddingService: EmbeddingService;

  constructor(config: EditAgentConfig) {
    this.documentService = config.documentService;
    this.fhirService = config.fhirService;
    this.searchService = config.searchService;
    this.embeddingService = config.embeddingService;

    // Initialize LLM
    this.llm = new ChatOpenAI({
      modelName: config.model || 'gpt-4',
      temperature: config.temperature || 0,
      openAIApiKey: config.openaiApiKey,
    });
  }

  /**
   * System prompt for edit agent
   */
  private getSystemPrompt(): string {
    return `You are an Edit Agent specialized in modifying medical documents safely and accurately.

Your responsibilities:
1. Identify the target document to edit from natural language instructions
2. Determine which fields need to be modified
3. Validate edits against FHIR schema if applicable
4. Preview changes and assess risks
5. Request confirmation for critical changes
6. Update documents with proper audit logging
7. Re-index documents for search

Guidelines:
- Always identify the target document first using search
- For FHIR documents, validate changes against R4 specification
- Preview significant changes before applying them
- Request confirmation for:
  - Medication dosage changes
  - Critical clinical information
  - Bulk edits
- Maintain detailed audit logs
- Explain your reasoning for edits
- If instructions are ambiguous, ask for clarification

Available tools:
- search_documents: Find the document to edit
- get_document: Retrieve full document details
- validate_fhir_edit: Validate FHIR changes
- preview_changes: Show before/after comparison
- apply_edit: Apply the changes to the document
- assess_risk: Evaluate risk level of changes

Remember: Patient safety is paramount. Be cautious with edits to critical medical information.`;
  }

  /**
   * Create agent-specific tools
   */
  private createTools() {
    const searchDocumentsTool = tool(
      async ({ query, patientId, documentType }) => {
        try {
          const results = await this.searchService.keywordSearch({
            text: query,
            patientId,
            documentType,
            limit: 10,
          });

          const formattedResults = results.results.map((result) => ({
            documentId: result.documentId,
            patientId: result.patientId,
            documentType: result.document.documentType,
            fileName: result.document.fileName,
            uploadDate: result.document.uploadTimestamp,
            score: result.score,
            highlights: result.highlights,
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
        description: 'Search for documents to edit. Use this to find the target document based on natural language description.',
        schema: z.object({
          query: z.string().describe('Search query to find the document'),
          patientId: z.string().optional().describe('Patient ID filter'),
          documentType: z.enum(['fhir', 'pdf', 'text', 'markdown']).optional().describe('Document type filter'),
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
              fhirResource: document.fhirResource,
              extractedText: document.extractedText,
              tags: document.tags,
              metadata: document.metadata,
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
        description: 'Retrieve full document details. Use this after finding the target document to get its current content.',
        schema: z.object({
          documentId: z.string().describe('The document ID'),
          userId: z.string().describe('The user requesting the document'),
        }),
      }
    );

    const validateFHIREditTool = tool(
      async ({ originalResource, updatedResource, resourceType }) => {
        try {
          // Validate the updated resource
          const validation = this.fhirService.validateResource(updatedResource, resourceType);

          return JSON.stringify({
            success: true,
            isValid: validation.isValid,
            errors: validation.errors,
            warnings: validation.warnings,
            message: validation.isValid
              ? 'FHIR edit is valid'
              : `FHIR edit has ${validation.errors.length} validation errors`,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'validate_fhir_edit',
        description: 'Validate FHIR resource changes against R4 specification. Use this before applying edits to FHIR documents.',
        schema: z.object({
          originalResource: z.any().describe('The original FHIR resource'),
          updatedResource: z.any().describe('The updated FHIR resource'),
          resourceType: z.string().describe('The FHIR resource type'),
        }),
      }
    );

    const previewChangesTool = tool(
      async ({ documentId, proposedChanges, userId }) => {
        try {
          const document = await this.documentService.getDocument(documentId, userId);

          if (!document) {
            return JSON.stringify({
              success: false,
              message: 'Document not found',
            });
          }

          // Create preview
          const before = {
            fhirResource: document.fhirResource,
            extractedText: document.extractedText?.substring(0, 200),
            tags: document.tags,
            metadata: document.metadata,
          };

          const after = {
            ...before,
            ...proposedChanges,
          };

          // Assess risks
          const risks: string[] = [];
          
          if (proposedChanges.fhirResource) {
            // Check for medication dosage changes
            if (document.fhirResourceType === 'Medication' || document.fhirResourceType === 'MedicationStatement') {
              risks.push('Medication information change - requires careful review');
            }
            
            // Check for critical fields
            if (proposedChanges.fhirResource.status !== document.fhirResource?.status) {
              risks.push('Status change detected');
            }
          }

          const requiresConfirmation = risks.length > 0;

          return JSON.stringify({
            success: true,
            preview: {
              before,
              after,
              risks,
              requiresConfirmation,
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
        name: 'preview_changes',
        description: 'Preview changes before applying them. Shows before/after comparison and identifies risks.',
        schema: z.object({
          documentId: z.string().describe('The document to preview changes for'),
          proposedChanges: z.any().describe('The proposed changes'),
          userId: z.string().describe('The user making the changes'),
        }),
      }
    );

    const applyEditTool = tool(
      async ({
        documentId,
        userId,
        fhirResource,
        extractedText,
        tags,
        metadata,
        confirmed,
      }) => {
        try {
          // Build update DTO
          const updates: UpdateDocumentDTO = {
            userId,
            fhirResource,
            extractedText,
            tags,
            metadata,
          };

          // Apply update
          const updatedDocument = await this.documentService.updateDocument(documentId, updates);

          if (!updatedDocument) {
            return JSON.stringify({
              success: false,
              message: 'Document not found',
            });
          }

          // Re-index in OpenSearch
          if (extractedText) {
            const embedding = await this.embeddingService.generateEmbedding(extractedText);
            await this.searchService.reindex(documentId, embedding);
          } else {
            await this.searchService.reindex(documentId);
          }

          // Get audit log ID (last entry)
          const auditLogId = updatedDocument.auditLog?.[updatedDocument.auditLog.length - 1]?.timestamp.toISOString();

          return JSON.stringify({
            success: true,
            documentId: updatedDocument.documentId,
            version: updatedDocument.version,
            auditLogId,
            message: 'Document updated successfully',
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'apply_edit',
        description: 'Apply changes to the document. This updates the document in the database and re-indexes it for search.',
        schema: z.object({
          documentId: z.string().describe('The document to update'),
          userId: z.string().describe('The user making the update'),
          fhirResource: z.any().optional().describe('Updated FHIR resource'),
          extractedText: z.string().optional().describe('Updated text content'),
          tags: z.array(z.string()).optional().describe('Updated tags'),
          metadata: z.record(z.any()).optional().describe('Updated metadata'),
          confirmed: z.boolean().optional().describe('Whether user confirmed critical changes'),
        }),
      }
    );

    const assessRiskTool = tool(
      async ({ documentType, fhirResourceType, changeType, changeDetails }) => {
        try {
          const risks: string[] = [];
          let riskLevel: 'low' | 'medium' | 'high' = 'low';
          let requiresConfirmation = false;

          // Assess based on document type
          if (documentType === 'fhir') {
            // FHIR-specific risks
            if (fhirResourceType === 'Medication' || fhirResourceType === 'MedicationStatement') {
              risks.push('Medication changes can affect patient treatment');
              riskLevel = 'high';
              requiresConfirmation = true;
            }

            if (fhirResourceType === 'Observation' && changeDetails?.includes('critical')) {
              risks.push('Critical observation value change');
              riskLevel = 'high';
              requiresConfirmation = true;
            }

            if (changeType === 'status_change') {
              risks.push('Status changes may affect clinical workflows');
              riskLevel = 'medium';
            }
          }

          // Assess based on change type
          if (changeType === 'bulk_edit') {
            risks.push('Bulk edits affect multiple fields');
            riskLevel = 'medium';
            requiresConfirmation = true;
          }

          if (changeType === 'delete_field') {
            risks.push('Deleting fields may result in data loss');
            riskLevel = 'medium';
          }

          return JSON.stringify({
            success: true,
            riskLevel,
            risks,
            requiresConfirmation,
            recommendation: requiresConfirmation
              ? 'Request user confirmation before proceeding'
              : 'Safe to proceed with edit',
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'assess_risk',
        description: 'Assess the risk level of proposed changes. Use this to determine if user confirmation is needed.',
        schema: z.object({
          documentType: z.enum(['fhir', 'pdf', 'text', 'markdown']).describe('Document type'),
          fhirResourceType: z.string().optional().describe('FHIR resource type if applicable'),
          changeType: z.string().describe('Type of change (e.g., "dosage_change", "status_change", "bulk_edit")'),
          changeDetails: z.string().optional().describe('Details about the change'),
        }),
      }
    );

    return [
      searchDocumentsTool,
      getDocumentTool,
      validateFHIREditTool,
      previewChangesTool,
      applyEditTool,
      assessRiskTool,
    ];
  }

  /**
   * Process natural language edit
   */
  async processNaturalLanguageEdit(
    instruction: string,
    patientId: string,
    userId: string,
    confirmed: boolean = false
  ): Promise<EditResult> {
    try {
      const tools = this.createTools();
      
      // Create messages
      const messages = [
        new SystemMessage(this.getSystemPrompt()),
        new HumanMessage(
          `Process this edit instruction:

Patient ID: ${patientId}
User ID: ${userId}
User Confirmed: ${confirmed}

Instruction: ${instruction}

Please:
1. Search for the target document
2. Retrieve the document details
3. Identify the specific changes needed
4. Validate changes if FHIR
5. Preview the changes and assess risk
6. If high risk and not confirmed, request confirmation
7. If confirmed or low risk, apply the edit
8. Provide a summary of what was changed

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
      let documentId: string | undefined;
      let fieldsModified: string[] = [];
      let validationWarnings: string[] = [];
      let requiresConfirmation = false;
      let changePreview: ChangePreview | undefined;

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
                  documentId = resultObj.documentId;
                }
                
                if (resultObj.preview) {
                  changePreview = resultObj.preview;
                  requiresConfirmation = resultObj.preview.requiresConfirmation;
                }
                
                if (resultObj.requiresConfirmation) {
                  requiresConfirmation = true;
                }
                
                if (resultObj.warnings) {
                  validationWarnings.push(...resultObj.warnings);
                }
                
                if (toolCall.name === 'apply_edit') {
                  // Extract modified fields from args
                  const args = toolCall.args as any;
                  if (args.fhirResource) fieldsModified.push('fhirResource');
                  if (args.extractedText) fieldsModified.push('extractedText');
                  if (args.tags) fieldsModified.push('tags');
                  if (args.metadata) fieldsModified.push('metadata');
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
          documentId,
          message: 'This edit requires confirmation. Please review the changes and confirm.',
          requiresConfirmation: true,
          changePreview,
          reasoning: reasoning.join('\n'),
        };
      }

      return {
        success: !!documentId,
        documentId,
        fieldsModified,
        message: finalResponse || 'Edit completed successfully',
        reasoning: reasoning.join('\n'),
        validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
        changePreview,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Edit failed: ${error.message}`,
        reasoning: error.stack,
      };
    }
  }

  /**
   * Process structured edit
   */
  async processStructuredEdit(
    documentId: string,
    updates: UpdateDocumentDTO
  ): Promise<EditResult> {
    try {
      const updatedDocument = await this.documentService.updateDocument(documentId, updates);

      if (!updatedDocument) {
        return {
          success: false,
          message: 'Document not found',
        };
      }

      // Re-index
      if (updates.extractedText) {
        const embedding = await this.embeddingService.generateEmbedding(updates.extractedText);
        await this.searchService.reindex(documentId, embedding);
      } else {
        await this.searchService.reindex(documentId);
      }

      const fieldsModified = Object.keys(updates).filter((k) => k !== 'userId');
      const auditLogId = updatedDocument.auditLog?.[updatedDocument.auditLog.length - 1]?.timestamp.toISOString();

      return {
        success: true,
        documentId: updatedDocument.documentId,
        fieldsModified,
        message: 'Document updated successfully',
        auditLogId,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Structured edit failed: ${error.message}`,
      };
    }
  }

  /**
   * Validate FHIR edit
   */
  validateFHIREdit(resource: any, resourceType: string) {
    return this.fhirService.validateResource(resource, resourceType);
  }

  /**
   * Preview changes
   */
  async previewChanges(
    documentId: string,
    updates: any,
    userId: string
  ): Promise<ChangePreview> {
    const document = await this.documentService.getDocument(documentId, userId);

    if (!document) {
      throw new Error('Document not found');
    }

    const before = {
      fhirResource: document.fhirResource,
      extractedText: document.extractedText,
      tags: document.tags,
      metadata: document.metadata,
    };

    const after = {
      ...before,
      ...updates,
    };

    const risks: string[] = [];
    
    if (updates.fhirResource && document.fhirResourceType === 'Medication') {
      risks.push('Medication change - requires review');
    }

    return {
      before,
      after,
      risks,
      requiresConfirmation: risks.length > 0,
    };
  }
}
