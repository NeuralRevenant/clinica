/**
 * Query Agent
 * Handles natural language queries over medical documents
 * 
 * Responsibilities:
 * - Interpret natural language queries
 * - Execute hybrid search (keyword + semantic)
 * - Retrieve relevant documents from OpenSearch
 * - Synthesize answers from multiple documents
 * - Cite sources with document IDs and timestamps
 * - Handle ambiguous queries with clarification requests
 * - Reason about query intent and search strategy
 * - Evaluate search results and refine if needed
 */

import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { SearchService } from '../service/search.service.js';
import { EmbeddingService } from '../service/embedding.service.js';
import { DocumentService } from '../service/document.service.js';

/**
 * Query Agent Configuration
 */
export interface QueryAgentConfig {
  searchService: SearchService;
  embeddingService: EmbeddingService;
  documentService: DocumentService;
  openaiApiKey: string;
  model?: string;
  temperature?: number;
}

/**
 * Query Result
 */
export interface QueryResult {
  success: boolean;
  answer: string;
  sources: DocumentReference[];
  confidence: number;
  needsClarification: boolean;
  clarificationQuestion?: string;
  reasoning?: string;
  searchStrategy?: string;
  refinementAttempts?: number;
}

/**
 * Document Reference
 */
export interface DocumentReference {
  documentId: string;
  fileName?: string;
  uploadDate: Date;
  relevanceScore: number;
  excerpt?: string;
}

/**
 * Query Agent
 */
export class QueryAgent {
  private llm: ChatOpenAI;
  private searchService: SearchService;
  private embeddingService: EmbeddingService;
  private documentService: DocumentService;

  constructor(config: QueryAgentConfig) {
    this.searchService = config.searchService;
    this.embeddingService = config.embeddingService;
    this.documentService = config.documentService;

    // Initialize LLM
    this.llm = new ChatOpenAI({
      modelName: config.model || 'gpt-4',
      temperature: config.temperature || 0,
      openAIApiKey: config.openaiApiKey,
    });
  }

  /**
   * System prompt for query agent
   */
  private getSystemPrompt(): string {
    return `You are a Query Agent specialized in answering questions about medical documents.

Your responsibilities:
1. Interpret natural language queries about medical information
2. Execute appropriate search strategies (keyword, semantic, or hybrid)
3. Retrieve relevant documents from the medical database
4. Synthesize comprehensive answers from multiple sources
5. Cite all sources with document IDs and timestamps
6. Request clarification when queries are ambiguous
7. Refine searches if initial results are insufficient

Guidelines:
- Always use hybrid search for best results (combines keyword and semantic)
- If results are insufficient, try refining the query or using different search terms
- Synthesize information from multiple documents when available
- Always cite your sources with document IDs
- If you cannot find relevant information, say so clearly
- Request clarification if the query is ambiguous or too broad
- Provide confidence scores for your answers
- Explain your search strategy and reasoning

Available tools:
- hybrid_search: Search using both keywords and semantic similarity (recommended)
- semantic_search: Search using only semantic similarity
- keyword_search: Search using only keywords
- get_document_details: Retrieve full document content
- refine_query: Improve query based on initial results

Remember: Accuracy is critical in medical contexts. Only provide information you can support with sources.`;
  }

  /**
   * Create agent-specific tools
   */
  private createTools() {
    const hybridSearchTool = tool(
      async ({ query, patientId, documentType, limit }) => {
        try {
          const embedding = await this.embeddingService.generateEmbedding(query);
          
          const results = await this.searchService.hybridSearch(query, embedding, {
            patientId,
            documentType,
            limit: limit || 10,
          });

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
            total: results.total,
            results: formattedResults,
            took: results.took,
            message: `Found ${results.total} documents using hybrid search`,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'hybrid_search',
        description: 'Search medical documents using hybrid search (keyword + semantic). This is the recommended search method for most queries as it combines exact matching with conceptual similarity.',
        schema: z.object({
          query: z.string().describe('The search query'),
          patientId: z.string().optional().describe('Filter by patient ID'),
          documentType: z.enum(['fhir', 'pdf', 'text', 'markdown']).optional().describe('Filter by document type'),
          limit: z.number().optional().describe('Maximum results (default: 10)'),
        }),
      }
    );

    const semanticSearchTool = tool(
      async ({ query, patientId, documentType, limit }) => {
        try {
          const embedding = await this.embeddingService.generateEmbedding(query);
          
          const results = await this.searchService.semanticSearch(query, embedding, {
            patientId,
            documentType,
            limit: limit || 10,
          });

          const formattedResults = results.results.map((result) => ({
            documentId: result.documentId,
            patientId: result.patientId,
            documentType: result.document.documentType,
            fileName: result.document.fileName,
            uploadDate: result.document.uploadTimestamp,
            score: result.score,
            tags: result.document.tags,
          }));

          return JSON.stringify({
            success: true,
            total: results.total,
            results: formattedResults,
            message: `Found ${results.total} documents using semantic search`,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'semantic_search',
        description: 'Search using only semantic similarity. Use this when you want to find conceptually related documents even if they use different terminology.',
        schema: z.object({
          query: z.string().describe('The search query'),
          patientId: z.string().optional().describe('Filter by patient ID'),
          documentType: z.enum(['fhir', 'pdf', 'text', 'markdown']).optional().describe('Filter by document type'),
          limit: z.number().optional().describe('Maximum results (default: 10)'),
        }),
      }
    );

    const keywordSearchTool = tool(
      async ({ query, patientId, documentType, limit }) => {
        try {
          const results = await this.searchService.keywordSearch({
            text: query,
            patientId,
            documentType,
            limit: limit || 10,
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
            message: `Found ${results.total} documents using keyword search`,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'keyword_search',
        description: 'Search using only keyword matching. Use this when you need exact term matches.',
        schema: z.object({
          query: z.string().describe('The search query'),
          patientId: z.string().optional().describe('Filter by patient ID'),
          documentType: z.enum(['fhir', 'pdf', 'text', 'markdown']).optional().describe('Filter by document type'),
          limit: z.number().optional().describe('Maximum results (default: 10)'),
        }),
      }
    );

    const getDocumentDetailsTool = tool(
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
              uploadTimestamp: document.uploadTimestamp,
              fileName: document.fileName,
              tags: document.tags,
              extractedText: document.extractedText,
              fhirResource: document.fhirResource,
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
        name: 'get_document_details',
        description: 'Retrieve full details of a specific document. Use this to get complete content after finding relevant documents through search.',
        schema: z.object({
          documentId: z.string().describe('The document ID'),
          userId: z.string().describe('The user requesting the document'),
        }),
      }
    );

    const refineQueryTool = tool(
      async ({ originalQuery, searchResults, reason }) => {
        try {
          // Use LLM to refine the query
          const refinementPrompt = `Original query: "${originalQuery}"
Search results: ${searchResults} documents found
Reason for refinement: ${reason}

Suggest a refined search query that would yield better results. Consider:
- Adding more specific medical terms
- Broadening the query if too narrow
- Focusing on key concepts if too broad
- Using synonyms or related terms

Respond with just the refined query, no explanation.`;

          const response = await this.llm.invoke([new HumanMessage(refinementPrompt)]);
          const refinedQuery = (response.content as string).trim();

          return JSON.stringify({
            success: true,
            refinedQuery,
            originalQuery,
            reasoning: reason,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'refine_query',
        description: 'Refine a search query based on initial results. Use this when search results are insufficient or not relevant.',
        schema: z.object({
          originalQuery: z.string().describe('The original search query'),
          searchResults: z.number().describe('Number of results from original query'),
          reason: z.string().describe('Why refinement is needed (e.g., "too few results", "not relevant")'),
        }),
      }
    );

    return [
      hybridSearchTool,
      semanticSearchTool,
      keywordSearchTool,
      getDocumentDetailsTool,
      refineQueryTool,
    ];
  }

  /**
   * Process query
   */
  async processQuery(
    query: string,
    patientId: string,
    userId: string
  ): Promise<QueryResult> {
    try {
      const tools = this.createTools();
      
      // Create messages
      const messages = [
        new SystemMessage(this.getSystemPrompt()),
        new HumanMessage(
          `Answer this medical query:

Patient ID: ${patientId}
User ID: ${userId}

Query: ${query}

Please:
1. Execute a hybrid search to find relevant documents
2. If results are insufficient, refine the query and search again
3. Retrieve full details of the most relevant documents
4. Synthesize a comprehensive answer from the sources
5. Cite all sources with document IDs and timestamps
6. Provide a confidence score (0-1) for your answer
7. If the query is ambiguous, ask for clarification

Be thorough, accurate, and always cite your sources.`
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
      let refinementAttempts = 0;
      const sources: DocumentReference[] = [];

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

              reasoning.push(`Tool: ${toolCall.name}, Args: ${JSON.stringify(toolCall.args)}`);
              
              // Track refinement attempts
              if (toolCall.name === 'refine_query') {
                refinementAttempts++;
              }

              // Extract sources from search results
              try {
                const resultObj = JSON.parse(result);
                if (resultObj.results) {
                  for (const doc of resultObj.results) {
                    if (!sources.find((s) => s.documentId === doc.documentId)) {
                      sources.push({
                        documentId: doc.documentId,
                        fileName: doc.fileName,
                        uploadDate: doc.uploadDate,
                        relevanceScore: doc.score,
                        excerpt: doc.highlights?.[0],
                      });
                    }
                  }
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

      // Analyze response for confidence and clarification needs
      const needsClarification = finalResponse.toLowerCase().includes('clarif') ||
                                 finalResponse.toLowerCase().includes('ambiguous') ||
                                 finalResponse.includes('?');

      // Extract confidence if mentioned
      let confidence = 0.7; // Default
      const confidenceMatch = finalResponse.match(/confidence[:\s]+(\d+\.?\d*)/i);
      if (confidenceMatch) {
        confidence = parseFloat(confidenceMatch[1]);
        if (confidence > 1) confidence = confidence / 100; // Convert percentage
      }

      // Extract clarification question if present
      let clarificationQuestion: string | undefined;
      if (needsClarification) {
        const questionMatch = finalResponse.match(/\?[^?]*$/);
        if (questionMatch) {
          clarificationQuestion = questionMatch[0].trim();
        }
      }

      return {
        success: sources.length > 0 || needsClarification,
        answer: finalResponse || 'No answer could be generated',
        sources: sources.slice(0, 10), // Limit to top 10 sources
        confidence,
        needsClarification,
        clarificationQuestion,
        reasoning: reasoning.join('\n'),
        searchStrategy: 'hybrid with refinement',
        refinementAttempts,
      };
    } catch (error: any) {
      return {
        success: false,
        answer: `Query processing failed: ${error.message}`,
        sources: [],
        confidence: 0,
        needsClarification: false,
        reasoning: error.stack,
      };
    }
  }

  /**
   * Execute hybrid search
   */
  async executeHybridSearch(
    query: string,
    patientId?: string,
    documentType?: 'fhir' | 'pdf' | 'text' | 'markdown',
    limit?: number
  ) {
    const embedding = await this.embeddingService.generateEmbedding(query);
    return this.searchService.hybridSearch(query, embedding, {
      patientId,
      documentType,
      limit: limit || 10,
    });
  }

  /**
   * Synthesize answer from documents
   */
  async synthesizeAnswer(
    documents: any[],
    query: string
  ): Promise<string> {
    const documentsText = documents
      .map((doc, idx) => `Document ${idx + 1} (${doc.documentId}): ${doc.extractedText?.substring(0, 500)}`)
      .join('\n\n');

    const prompt = `Based on these medical documents, answer the following query:

Query: ${query}

Documents:
${documentsText}

Provide a comprehensive answer that:
1. Synthesizes information from multiple documents
2. Cites sources with document IDs
3. Is accurate and medically sound
4. Acknowledges any limitations or missing information

Answer:`;

    const response = await this.llm.invoke([new HumanMessage(prompt)]);
    return response.content as string;
  }

  /**
   * Refine query based on results
   */
  async refineQuery(
    originalQuery: string,
    resultCount: number
  ): Promise<string> {
    const prompt = `The search query "${originalQuery}" returned ${resultCount} results.
${resultCount === 0 ? 'This is too few.' : resultCount > 50 ? 'This is too many.' : 'This might not be optimal.'}

Suggest a refined query that would yield better results. Respond with just the refined query.`;

    const response = await this.llm.invoke([new HumanMessage(prompt)]);
    return (response.content as string).trim();
  }
}
