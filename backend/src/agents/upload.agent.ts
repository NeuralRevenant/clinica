/**
 * Upload Agent
 * Handles document upload processing through natural language or file interface
 * 
 * Responsibilities:
 * - Process document uploads from natural language or file interface
 * - Parse FHIR JSON documents
 * - Extract text from PDFs and unstructured documents
 * - Extract medical entities (conditions, medications, procedures)
 * - Store documents in MongoDB
 * - Index documents in OpenSearch
 * - Generate vector embeddings
 * - Reason about document type and validation requirements
 * - Self-correct on validation failures
 */

import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DocumentService } from '../service/document.service.js';
import { FHIRService } from '../service/fhir.service.js';
import { EntityExtractionService } from '../service/entity-extraction.service.js';
import { EmbeddingService } from '../service/embedding.service.js';
import { SearchService } from '../service/search.service.js';

/**
 * Upload Agent Configuration
 */
export interface UploadAgentConfig {
  documentService: DocumentService;
  fhirService: FHIRService;
  entityExtractionService: EntityExtractionService;
  embeddingService: EmbeddingService;
  searchService: SearchService;
  openaiApiKey: string;
  model?: string;
  temperature?: number;
}

/**
 * Upload Result
 */
export interface UploadResult {
  success: boolean;
  documentId?: string;
  documentType?: 'fhir' | 'pdf' | 'text' | 'markdown';
  message: string;
  reasoning?: string;
  corrections?: string[];
  validationErrors?: string[];
  extractedEntities?: any[];
}

/**
 * Upload Agent
 */
export class UploadAgent {
  private llm: ChatOpenAI;
  private documentService: DocumentService;
  private fhirService: FHIRService;
  private entityExtractionService: EntityExtractionService;
  private embeddingService: EmbeddingService;
  private searchService: SearchService;

  constructor(config: UploadAgentConfig) {
    this.documentService = config.documentService;
    this.fhirService = config.fhirService;
    this.entityExtractionService = config.entityExtractionService;
    this.embeddingService = config.embeddingService;
    this.searchService = config.searchService;

    // Initialize LLM
    this.llm = new ChatOpenAI({
      modelName: config.model || 'gpt-4',
      temperature: config.temperature || 0,
      openAIApiKey: config.openaiApiKey,
    });
  }

  /**
   * System prompt for upload agent
   */
  private getSystemPrompt(): string {
    return `You are an Upload Agent specialized in processing medical documents.

Your responsibilities:
1. Analyze user input to determine document type (FHIR, PDF, text, markdown)
2. Extract and validate medical information
3. Identify the patient associated with the document
4. Extract medical entities (conditions, medications, procedures, observations)
5. Store documents securely with proper encryption
6. Self-correct when validation fails

Guidelines:
- Always identify the document type first
- For FHIR documents, validate against R4 specification
- For text documents, extract medical entities
- If patient ID is missing, ask the user for it
- If validation fails, explain the errors and suggest corrections
- Provide clear reasoning for your decisions
- Be thorough but concise in your responses

Available tools:
- identify_document_type: Analyze content to determine document type
- validate_fhir_document: Validate FHIR resources
- extract_text_content: Extract text from various formats
- extract_medical_entities: Extract medical entities from text
- store_document: Store document in database and index for search

Remember: Patient safety is paramount. Always validate medical information carefully.`;
  }

  /**
   * Create agent-specific tools
   */
  private createTools() {
    const identifyDocumentTypeTool = tool(
      async ({ content }) => {
        try {
          // Try to parse as JSON first (FHIR)
          if (typeof content === 'string') {
            try {
              const parsed = JSON.parse(content);
              if (parsed.resourceType) {
                return JSON.stringify({
                  success: true,
                  documentType: 'fhir',
                  resourceType: parsed.resourceType,
                  confidence: 0.95,
                  reasoning: 'Content is valid JSON with resourceType field, indicating FHIR format',
                });
              }
            } catch (e) {
              // Not JSON, continue
            }
          }

          // Check for markdown indicators
          if (typeof content === 'string' && (content.includes('# ') || content.includes('## ') || content.includes('```'))) {
            return JSON.stringify({
              success: true,
              documentType: 'markdown',
              confidence: 0.8,
              reasoning: 'Content contains markdown formatting indicators',
            });
          }

          // Check for PDF indicators (would be binary in real scenario)
          if (typeof content === 'string' && content.startsWith('%PDF')) {
            return JSON.stringify({
              success: true,
              documentType: 'pdf',
              confidence: 0.9,
              reasoning: 'Content starts with PDF magic number',
            });
          }

          // Default to text
          return JSON.stringify({
            success: true,
            documentType: 'text',
            confidence: 0.7,
            reasoning: 'Content appears to be plain text',
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'identify_document_type',
        description: 'Analyze document content to determine its type (FHIR, PDF, text, markdown). Returns document type and confidence score.',
        schema: z.object({
          content: z.union([z.string(), z.any()]).describe('The document content to analyze'),
        }),
      }
    );

    const validateFHIRDocumentTool = tool(
      async ({ fhirDocument }) => {
        try {
          let parsed = fhirDocument;
          if (typeof fhirDocument === 'string') {
            parsed = JSON.parse(fhirDocument);
          }

          // Extract resources
          const resources = this.fhirService.extractResources(parsed);
          
          // Validate each resource
          const validationResults = resources.map((resource) => {
            const validation = this.fhirService.validateResource(resource, resource.resourceType);
            return {
              resourceType: resource.resourceType,
              id: resource.id,
              isValid: validation.isValid,
              errors: validation.errors,
              warnings: validation.warnings,
            };
          });

          const validCount = validationResults.filter((r) => r.isValid).length;
          const invalidCount = validationResults.filter((r) => !r.isValid).length;

          return JSON.stringify({
            success: true,
            totalResources: resources.length,
            validResources: validCount,
            invalidResources: invalidCount,
            validationResults,
            allValid: invalidCount === 0,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'validate_fhir_document',
        description: 'Validate FHIR document against R4 specification. Returns validation results for all resources.',
        schema: z.object({
          fhirDocument: z.union([z.string(), z.any()]).describe('The FHIR document to validate'),
        }),
      }
    );

    const extractTextContentTool = tool(
      async ({ content, documentType }) => {
        try {
          let extractedText = '';

          if (documentType === 'fhir') {
            // Extract text from FHIR resource
            const parsed = typeof content === 'string' ? JSON.parse(content) : content;
            extractedText = JSON.stringify(parsed, null, 2);
          } else if (documentType === 'pdf') {
            // In production, use pdf-parse or similar
            extractedText = 'PDF text extraction not implemented in this version';
          } else {
            // Plain text or markdown
            extractedText = typeof content === 'string' ? content : JSON.stringify(content);
          }

          return JSON.stringify({
            success: true,
            extractedText,
            length: extractedText.length,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'extract_text_content',
        description: 'Extract text content from document based on its type. Handles FHIR, PDF, text, and markdown formats.',
        schema: z.object({
          content: z.union([z.string(), z.any()]).describe('The document content'),
          documentType: z.enum(['fhir', 'pdf', 'text', 'markdown']).describe('The document type'),
        }),
      }
    );

    const extractMedicalEntitiesTool = tool(
      async ({ text }) => {
        try {
          const entities = await this.entityExtractionService.extractEntities(text);

          return JSON.stringify({
            success: true,
            entities: entities.map((e) => ({
              text: e.text,
              type: e.type,
              confidence: e.confidence,
              normalizedCode: e.normalizedCode,
            })),
            totalEntities: entities.length,
            byType: {
              conditions: entities.filter((e) => e.type === 'condition').length,
              medications: entities.filter((e) => e.type === 'medication').length,
              procedures: entities.filter((e) => e.type === 'procedure').length,
              observations: entities.filter((e) => e.type === 'observation').length,
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
        name: 'extract_medical_entities',
        description: 'Extract medical entities (conditions, medications, procedures, observations) from text using NLP.',
        schema: z.object({
          text: z.string().describe('The text to extract entities from'),
        }),
      }
    );

    const storeDocumentTool = tool(
      async ({
        patientId,
        documentType,
        uploadMethod,
        userId,
        content,
        extractedText,
        fileName,
        tags,
        metadata,
      }) => {
        try {
          // Parse FHIR content if applicable
          let fhirResource;
          let fhirResourceType;
          
          if (documentType === 'fhir') {
            const parsed = typeof content === 'string' ? JSON.parse(content) : content;
            const resources = this.fhirService.extractResources(parsed);
            
            if (resources.length > 0) {
              fhirResource = resources[0]; // Store first resource
              fhirResourceType = resources[0].resourceType;
            }
          }

          // Create document
          const document = await this.documentService.createDocument({
            patientId,
            documentType,
            uploadMethod,
            userId,
            fhirResourceType,
            fhirResource,
            extractedText,
            fileName,
            tags: tags || [],
            metadata: metadata || {},
          });

          // Generate embedding and index
          if (extractedText) {
            const embedding = await this.embeddingService.generateEmbedding(extractedText);
            await this.searchService.indexDocument(document, embedding);
          } else {
            await this.searchService.indexDocument(document);
          }

          return JSON.stringify({
            success: true,
            documentId: document.documentId,
            message: `Document stored successfully with ID ${document.documentId}`,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'store_document',
        description: 'Store document in database and index for search. Handles encryption and audit logging automatically.',
        schema: z.object({
          patientId: z.string().describe('Patient ID this document belongs to'),
          documentType: z.enum(['fhir', 'pdf', 'text', 'markdown']).describe('Document type'),
          uploadMethod: z.enum(['naturalLanguage', 'fileUpload']).describe('Upload method'),
          userId: z.string().describe('User uploading the document'),
          content: z.union([z.string(), z.any()]).describe('Document content'),
          extractedText: z.string().optional().describe('Extracted text content'),
          fileName: z.string().optional().describe('Original filename'),
          tags: z.array(z.string()).optional().describe('Document tags'),
          metadata: z.record(z.any()).optional().describe('Additional metadata'),
        }),
      }
    );

    return [
      identifyDocumentTypeTool,
      validateFHIRDocumentTool,
      extractTextContentTool,
      extractMedicalEntitiesTool,
      storeDocumentTool,
    ];
  }

  /**
   * Process natural language upload
   */
  async processNaturalLanguageUpload(
    text: string,
    patientId: string,
    userId: string
  ): Promise<UploadResult> {
    try {
      const tools = this.createTools();
      
      // Create messages
      const messages = [
        new SystemMessage(this.getSystemPrompt()),
        new HumanMessage(
          `Process this medical document upload via natural language:

Patient ID: ${patientId}
User ID: ${userId}
Upload Method: naturalLanguage

Document Content:
${text}

Please:
1. Identify the document type
2. Validate if it's FHIR, or extract entities if it's text
3. Extract text content
4. Store the document
5. Provide a summary of what was uploaded

Be thorough and explain your reasoning.`
        ),
      ];

      // Bind tools to LLM
      const llmWithTools = this.llm.bindTools(tools);

      // Invoke with reasoning
      let currentMessages = [...messages];
      let iterations = 0;
      const maxIterations = 10;
      let finalResponse = '';
      const reasoning: string[] = [];
      const corrections: string[] = [];

      while (iterations < maxIterations) {
        iterations++;

        const response = await llmWithTools.invoke(currentMessages);
        
        // Add response to messages
        currentMessages.push(response);

        // Check if there are tool calls
        if (response.tool_calls && response.tool_calls.length > 0) {
          // Execute tool calls
          for (const toolCall of response.tool_calls) {
            const tool = tools.find((t) => t.name === toolCall.name);
            if (tool) {
              const result = await tool.invoke(toolCall.args);
              
              // Add tool result to messages
              currentMessages.push({
                role: 'tool',
                content: result,
                tool_call_id: toolCall.id,
              } as any);

              // Track reasoning
              reasoning.push(`Tool: ${toolCall.name}, Args: ${JSON.stringify(toolCall.args)}`);
              
              // Check for corrections
              const resultObj = JSON.parse(result);
              if (!resultObj.success || resultObj.validationResults?.some((r: any) => !r.isValid)) {
                corrections.push(`Correction needed: ${resultObj.error || 'Validation failed'}`);
              }
            }
          }
        } else {
          // No more tool calls, we have final response
          finalResponse = response.content as string;
          break;
        }
      }

      // Parse final response to extract document ID
      let documentId: string | undefined;
      let documentType: 'fhir' | 'pdf' | 'text' | 'markdown' | undefined;
      
      // Look for document ID in tool results
      for (const msg of currentMessages) {
        if (msg.role === 'tool' && typeof msg.content === 'string') {
          try {
            const parsed = JSON.parse(msg.content);
            if (parsed.documentId) {
              documentId = parsed.documentId;
            }
            if (parsed.documentType) {
              documentType = parsed.documentType;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }

      return {
        success: !!documentId,
        documentId,
        documentType,
        message: finalResponse || 'Document processed successfully',
        reasoning: reasoning.join('\n'),
        corrections: corrections.length > 0 ? corrections : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Upload failed: ${error.message}`,
        reasoning: error.stack,
      };
    }
  }

  /**
   * Process file upload
   */
  async processFileUpload(
    fileContent: string | Buffer,
    fileName: string,
    mimeType: string,
    patientId: string,
    userId: string
  ): Promise<UploadResult> {
    try {
      // Convert buffer to string if needed
      const content = Buffer.isBuffer(fileContent) ? fileContent.toString('utf-8') : fileContent;

      const tools = this.createTools();
      
      // Create messages
      const messages = [
        new SystemMessage(this.getSystemPrompt()),
        new HumanMessage(
          `Process this file upload:

Patient ID: ${patientId}
User ID: ${userId}
Upload Method: fileUpload
File Name: ${fileName}
MIME Type: ${mimeType}

File Content:
${content.substring(0, 5000)}${content.length > 5000 ? '... (truncated)' : ''}

Please:
1. Identify the document type based on filename and content
2. Validate if it's FHIR, or extract entities if it's text
3. Extract text content
4. Extract medical entities
5. Store the document
6. Provide a summary

Be thorough and explain your reasoning.`
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
      const corrections: string[] = [];
      const extractedEntities: any[] = [];

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
              
              const resultObj = JSON.parse(result);
              if (!resultObj.success) {
                corrections.push(`Correction: ${resultObj.error}`);
              }
              
              if (resultObj.entities) {
                extractedEntities.push(...resultObj.entities);
              }
            }
          }
        } else {
          finalResponse = response.content as string;
          break;
        }
      }

      // Extract document ID from tool results
      let documentId: string | undefined;
      let documentType: 'fhir' | 'pdf' | 'text' | 'markdown' | undefined;
      
      for (const msg of currentMessages) {
        if (msg.role === 'tool' && typeof msg.content === 'string') {
          try {
            const parsed = JSON.parse(msg.content);
            if (parsed.documentId) documentId = parsed.documentId;
            if (parsed.documentType) documentType = parsed.documentType;
          } catch (e) {
            // Ignore
          }
        }
      }

      return {
        success: !!documentId,
        documentId,
        documentType,
        message: finalResponse || 'File uploaded successfully',
        reasoning: reasoning.join('\n'),
        corrections: corrections.length > 0 ? corrections : undefined,
        extractedEntities: extractedEntities.length > 0 ? extractedEntities : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `File upload failed: ${error.message}`,
        reasoning: error.stack,
      };
    }
  }

  /**
   * Parse FHIR document
   */
  async parseFHIRDocument(fhirJson: any): Promise<any[]> {
    return this.fhirService.extractResources(fhirJson);
  }

  /**
   * Extract text from PDF (placeholder)
   */
  async extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
    // In production, use pdf-parse or similar library
    return 'PDF text extraction not implemented in this version';
  }
}
