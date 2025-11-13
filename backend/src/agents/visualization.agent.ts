/**
 * Visualization Agent
 * Handles graph visualization generation from medical data
 * 
 * Responsibilities:
 * - Extract medical entities and relationships from documents
 * - Build graph structure (nodes: conditions, medications, procedures; edges: relationships)
 * - Generate graph visualization data
 * - Support interactive exploration
 * - Reason about relevant entities for visualization
 * - Evaluate graph quality and completeness
 */

import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { EntityExtractionService } from '../service/entity-extraction.service.js';
import { GraphService, GraphData, GraphNode, GraphEdge } from '../service/graph.service.js';
import { SearchService } from '../service/search.service.js';
import { DocumentService } from '../service/document.service.js';

/**
 * Visualization Agent Configuration
 */
export interface VisualizationAgentConfig {
  entityExtractionService: EntityExtractionService;
  graphService: GraphService;
  searchService: SearchService;
  documentService: DocumentService;
  openaiApiKey: string;
  model?: string;
  temperature?: number;
}

/**
 * Visualization Result
 */
export interface VisualizationResult {
  success: boolean;
  graph?: GraphData;
  message: string;
  reasoning?: string;
  qualityScore?: number;
  suggestions?: string[];
  entityCount?: {
    conditions: number;
    medications: number;
    procedures: number;
    observations: number;
  };
}

/**
 * Graph Quality Metrics
 */
export interface GraphQualityMetrics {
  completeness: number;
  connectivity: number;
  relevance: number;
  suggestions: string[];
}

/**
 * Visualization Agent
 */
export class VisualizationAgent {
  private llm: ChatOpenAI;
  private entityExtractionService: EntityExtractionService;
  private graphService: GraphService;
  private searchService: SearchService;
  private documentService: DocumentService;

  constructor(config: VisualizationAgentConfig) {
    this.entityExtractionService = config.entityExtractionService;
    this.graphService = config.graphService;
    this.searchService = config.searchService;
    this.documentService = config.documentService;

    // Initialize LLM
    this.llm = new ChatOpenAI({
      modelName: config.model || 'gpt-4',
      temperature: config.temperature || 0,
      openAIApiKey: config.openaiApiKey,
    });
  }

  /**
   * System prompt for visualization agent
   */
  private getSystemPrompt(): string {
    return `You are a Visualization Agent specialized in creating medical knowledge graphs.

Your responsibilities:
1. Identify relevant medical entities for visualization based on user query
2. Extract entities from medical documents
3. Build relationships between entities (conditions, medications, procedures, observations)
4. Generate graph visualization data
5. Evaluate graph quality and completeness
6. Suggest improvements for incomplete graphs

Guidelines:
- Focus on entities relevant to the user's query
- Include all important relationships (e.g., medication treats condition)
- Evaluate graph quality based on:
  - Completeness: Are all relevant entities included?
  - Connectivity: Are entities properly connected?
  - Relevance: Are entities relevant to the query?
- Suggest additional data if graph is incomplete
- Provide clear reasoning for entity selection
- If query is too broad, ask for clarification

Available tools:
- search_relevant_documents: Find documents related to the query
- extract_entities_from_documents: Extract medical entities from documents
- build_graph: Build graph from entities
- find_relationships: Identify relationships between entities
- evaluate_graph_quality: Assess graph completeness and quality
- suggest_improvements: Recommend additional data or refinements

Remember: Visualizations should be clear, accurate, and focused on answering the user's question.`;
  }

  /**
   * Create agent-specific tools
   */
  private createTools() {
    const searchRelevantDocumentsTool = tool(
      async ({ query, patientId, limit }) => {
        try {
          const results = await this.searchService.keywordSearch({
            text: query,
            patientId,
            limit: limit || 20,
          });

          const formattedResults = results.results.map((result) => ({
            documentId: result.documentId,
            patientId: result.patientId,
            documentType: result.document.documentType,
            fileName: result.document.fileName,
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
        name: 'search_relevant_documents',
        description: 'Search for documents relevant to the visualization query. Use this to find documents containing entities to visualize.',
        schema: z.object({
          query: z.string().describe('Search query for relevant documents'),
          patientId: z.string().describe('Patient ID'),
          limit: z.number().optional().describe('Maximum documents to retrieve (default: 20)'),
        }),
      }
    );

    const extractEntitiesFromDocumentsTool = tool(
      async ({ documentIds, userId }) => {
        try {
          const allEntities: any[] = [];
          const entityCounts = {
            conditions: 0,
            medications: 0,
            procedures: 0,
            observations: 0,
          };

          for (const documentId of documentIds) {
            const document = await this.documentService.getDocument(documentId, userId);
            
            if (document && document.extractedText) {
              const entities = await this.entityExtractionService.extractEntities(document.extractedText);
              
              for (const entity of entities) {
                allEntities.push({
                  id: `${entity.type}-${entity.text.replace(/\s+/g, '-')}`,
                  text: entity.text,
                  type: entity.type,
                  confidence: entity.confidence,
                  normalizedCode: entity.normalizedCode,
                  documentId,
                });

                if (entity.type === 'condition') entityCounts.conditions++;
                else if (entity.type === 'medication') entityCounts.medications++;
                else if (entity.type === 'procedure') entityCounts.procedures++;
                else if (entity.type === 'observation') entityCounts.observations++;
              }
            }
          }

          return JSON.stringify({
            success: true,
            entities: allEntities,
            totalEntities: allEntities.length,
            entityCounts,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'extract_entities_from_documents',
        description: 'Extract medical entities from documents. Returns conditions, medications, procedures, and observations.',
        schema: z.object({
          documentIds: z.array(z.string()).describe('Document IDs to extract entities from'),
          userId: z.string().describe('User ID'),
        }),
      }
    );

    const buildGraphTool = tool(
      async ({ entities, patientId }) => {
        try {
          // Build nodes from entities
          const nodes: GraphNode[] = entities.map((entity: any) => ({
            id: entity.id,
            type: entity.type,
            label: entity.text,
            properties: {
              confidence: entity.confidence,
              normalizedCode: entity.normalizedCode,
              documentId: entity.documentId,
            },
          }));

          // Build edges (relationships)
          const edges: GraphEdge[] = [];
          
          // Find relationships between entities
          const medications = entities.filter((e: any) => e.type === 'medication');
          const conditions = entities.filter((e: any) => e.type === 'condition');
          const procedures = entities.filter((e: any) => e.type === 'procedure');
          const observations = entities.filter((e: any) => e.type === 'observation');

          // Medication -> Condition (treats)
          for (const med of medications) {
            for (const cond of conditions) {
              edges.push({
                source: med.id,
                target: cond.id,
                relationship: 'treats',
                weight: 1.0,
                confidence: 0.7,
              });
            }
          }

          // Procedure -> Condition (addresses)
          for (const proc of procedures) {
            for (const cond of conditions) {
              edges.push({
                source: proc.id,
                target: cond.id,
                relationship: 'addresses',
                weight: 1.0,
                confidence: 0.7,
              });
            }
          }

          // Observation -> Condition (indicates)
          for (const obs of observations) {
            for (const cond of conditions) {
              edges.push({
                source: obs.id,
                target: cond.id,
                relationship: 'indicates',
                weight: 0.8,
                confidence: 0.6,
              });
            }
          }

          const graph: GraphData = {
            nodes,
            edges,
            metadata: {
              patientId,
              generatedAt: new Date().toISOString(),
              nodeCount: nodes.length,
              edgeCount: edges.length,
            },
          };

          return JSON.stringify({
            success: true,
            graph,
            nodeCount: nodes.length,
            edgeCount: edges.length,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'build_graph',
        description: 'Build a graph from extracted entities. Creates nodes and edges representing medical relationships.',
        schema: z.object({
          entities: z.array(z.any()).describe('Entities to build graph from'),
          patientId: z.string().describe('Patient ID'),
        }),
      }
    );

    const findRelationshipsTool = tool(
      async ({ entities }) => {
        try {
          const relationships: any[] = [];

          // Group entities by type
          const byType: Record<string, any[]> = {
            condition: [],
            medication: [],
            procedure: [],
            observation: [],
          };

          for (const entity of entities) {
            if (byType[entity.type]) {
              byType[entity.type].push(entity);
            }
          }

          // Find relationships
          // Medication treats Condition
          for (const med of byType.medication) {
            for (const cond of byType.condition) {
              relationships.push({
                source: med.id,
                target: cond.id,
                type: 'treats',
                confidence: 0.7,
              });
            }
          }

          // Procedure addresses Condition
          for (const proc of byType.procedure) {
            for (const cond of byType.condition) {
              relationships.push({
                source: proc.id,
                target: cond.id,
                type: 'addresses',
                confidence: 0.7,
              });
            }
          }

          // Observation indicates Condition
          for (const obs of byType.observation) {
            for (const cond of byType.condition) {
              relationships.push({
                source: obs.id,
                target: cond.id,
                type: 'indicates',
                confidence: 0.6,
              });
            }
          }

          return JSON.stringify({
            success: true,
            relationships,
            totalRelationships: relationships.length,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'find_relationships',
        description: 'Identify relationships between medical entities. Returns connections like "medication treats condition".',
        schema: z.object({
          entities: z.array(z.any()).describe('Entities to find relationships between'),
        }),
      }
    );

    const evaluateGraphQualityTool = tool(
      async ({ graph, query }) => {
        try {
          const nodeCount = graph.nodes.length;
          const edgeCount = graph.edges.length;

          // Calculate completeness (0-1)
          let completeness = 0;
          if (nodeCount > 0) {
            completeness = Math.min(nodeCount / 10, 1.0); // Assume 10 nodes is "complete"
          }

          // Calculate connectivity (0-1)
          let connectivity = 0;
          if (nodeCount > 0) {
            const avgEdgesPerNode = edgeCount / nodeCount;
            connectivity = Math.min(avgEdgesPerNode / 2, 1.0); // Assume 2 edges per node is well-connected
          }

          // Calculate relevance (simplified - would use LLM in production)
          const relevance = 0.8; // Default high relevance

          // Generate suggestions
          const suggestions: string[] = [];
          
          if (completeness < 0.5) {
            suggestions.push('Graph may be incomplete. Consider searching for more documents.');
          }
          
          if (connectivity < 0.3) {
            suggestions.push('Graph has low connectivity. Some entities may be isolated.');
          }
          
          if (nodeCount === 0) {
            suggestions.push('No entities found. Try a different search query.');
          }

          const qualityScore = (completeness + connectivity + relevance) / 3;

          return JSON.stringify({
            success: true,
            metrics: {
              completeness,
              connectivity,
              relevance,
              qualityScore,
              suggestions,
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
        name: 'evaluate_graph_quality',
        description: 'Evaluate the quality of the generated graph. Returns completeness, connectivity, and relevance scores.',
        schema: z.object({
          graph: z.any().describe('The graph to evaluate'),
          query: z.string().describe('The original query'),
        }),
      }
    );

    const suggestImprovementsTool = tool(
      async ({ graph, query, qualityMetrics }) => {
        try {
          const suggestions: string[] = [];

          if (qualityMetrics.completeness < 0.5) {
            suggestions.push('Search for additional documents related to: ' + query);
          }

          if (qualityMetrics.connectivity < 0.3) {
            suggestions.push('Look for documents that describe relationships between entities');
          }

          if (graph.nodes.length === 0) {
            suggestions.push('No entities found. Try broadening your search query');
          }

          // Type-specific suggestions
          const nodeTypes = graph.nodes.map((n: any) => n.type);
          if (!nodeTypes.includes('medication')) {
            suggestions.push('Consider adding medication information');
          }
          if (!nodeTypes.includes('condition')) {
            suggestions.push('Consider adding condition/diagnosis information');
          }

          return JSON.stringify({
            success: true,
            suggestions,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'suggest_improvements',
        description: 'Suggest improvements for the graph based on quality metrics. Returns actionable recommendations.',
        schema: z.object({
          graph: z.any().describe('The current graph'),
          query: z.string().describe('The original query'),
          qualityMetrics: z.any().describe('Quality metrics from evaluation'),
        }),
      }
    );

    return [
      searchRelevantDocumentsTool,
      extractEntitiesFromDocumentsTool,
      buildGraphTool,
      findRelationshipsTool,
      evaluateGraphQualityTool,
      suggestImprovementsTool,
    ];
  }

  /**
   * Generate graph visualization
   */
  async generateGraph(
    query: string,
    patientId: string,
    userId: string
  ): Promise<VisualizationResult> {
    try {
      const tools = this.createTools();
      
      // Create messages
      const messages = [
        new SystemMessage(this.getSystemPrompt()),
        new HumanMessage(
          `Generate a graph visualization for this query:

Patient ID: ${patientId}
User ID: ${userId}

Query: ${query}

Please:
1. Search for relevant documents
2. Extract medical entities from the documents
3. Build a graph with nodes and edges
4. Find relationships between entities
5. Evaluate the graph quality
6. Suggest improvements if needed
7. Provide a summary of the visualization

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
      let graph: GraphData | undefined;
      let qualityScore: number | undefined;
      let suggestions: string[] = [];
      let entityCount: any = {};

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
                
                if (resultObj.graph) {
                  graph = resultObj.graph;
                }
                
                if (resultObj.entityCounts) {
                  entityCount = resultObj.entityCounts;
                }
                
                if (resultObj.metrics) {
                  qualityScore = resultObj.metrics.qualityScore;
                  if (resultObj.metrics.suggestions) {
                    suggestions.push(...resultObj.metrics.suggestions);
                  }
                }
                
                if (resultObj.suggestions) {
                  suggestions.push(...resultObj.suggestions);
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

      return {
        success: !!graph,
        graph,
        message: finalResponse || 'Graph generated successfully',
        reasoning: reasoning.join('\n'),
        qualityScore,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        entityCount: Object.keys(entityCount).length > 0 ? entityCount : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Graph generation failed: ${error.message}`,
        reasoning: error.stack,
      };
    }
  }

  /**
   * Extract relationships from documents
   */
  async extractRelationships(documents: any[]): Promise<any[]> {
    const allEntities: any[] = [];

    for (const doc of documents) {
      if (doc.extractedText) {
        const entities = await this.entityExtractionService.extractEntities(doc.extractedText);
        allEntities.push(...entities);
      }
    }

    // Build relationships
    const relationships: any[] = [];
    const medications = allEntities.filter((e) => e.type === 'medication');
    const conditions = allEntities.filter((e) => e.type === 'condition');

    for (const med of medications) {
      for (const cond of conditions) {
        relationships.push({
          source: med.text,
          target: cond.text,
          type: 'treats',
        });
      }
    }

    return relationships;
  }

  /**
   * Identify relevant entities
   */
  async identifyRelevantEntities(
    query: string,
    patientId: string
  ): Promise<any[]> {
    const results = await this.searchService.keywordSearch({
      text: query,
      patientId,
      limit: 20,
    });

    const allEntities: any[] = [];

    for (const result of results.results) {
      if (result.document.extractedText) {
        const entities = await this.entityExtractionService.extractEntities(
          result.document.extractedText
        );
        allEntities.push(...entities);
      }
    }

    return allEntities;
  }

  /**
   * Evaluate graph quality
   */
  evaluateGraphQuality(graph: GraphData): GraphQualityMetrics {
    const nodeCount = graph.nodes.length;
    const edgeCount = graph.edges.length;

    const completeness = Math.min(nodeCount / 10, 1.0);
    const connectivity = nodeCount > 0 ? Math.min(edgeCount / nodeCount / 2, 1.0) : 0;
    const relevance = 0.8; // Simplified

    const suggestions: string[] = [];
    if (completeness < 0.5) {
      suggestions.push('Graph may be incomplete');
    }
    if (connectivity < 0.3) {
      suggestions.push('Low connectivity between entities');
    }

    return {
      completeness,
      connectivity,
      relevance,
      suggestions,
    };
  }
}
