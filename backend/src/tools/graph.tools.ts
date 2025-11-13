/**
 * Entity and Graph Tools for LangChain Agents
 * Provides tools for extracting medical entities, normalizing them, and building knowledge graphs
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { EntityExtractionService } from '../service/entity-extraction.service.js';
import { GraphService, GraphQuery } from '../service/graph.service.js';

/**
 * Create entity and graph operation tools
 */
export function createGraphTools(
  entityExtractionService: EntityExtractionService,
  graphService: GraphService
) {
  /**
   * Extract Entities Tool
   * Extracts medical entities from unstructured text
   */
  const extractEntitiesTool = tool(
    async ({ text, entityTypes }) => {
      try {
        // Extract entities
        const entities = await entityExtractionService.extractEntities(text);

        // Filter by entity types if specified
        let filteredEntities = entities;
        if (entityTypes && entityTypes.length > 0) {
          filteredEntities = entities.filter((entity) =>
            entityTypes.includes(entity.type)
          );
        }

        // Group entities by type
        const entitiesByType: Record<string, any[]> = {};
        for (const entity of filteredEntities) {
          if (!entitiesByType[entity.type]) {
            entitiesByType[entity.type] = [];
          }
          entitiesByType[entity.type].push({
            text: entity.text,
            confidence: entity.confidence,
            normalizedCode: entity.normalizedCode,
            startOffset: entity.startOffset,
            endOffset: entity.endOffset,
          });
        }

        // Calculate statistics
        const totalEntities = filteredEntities.length;
        const highConfidenceEntities = filteredEntities.filter(
          (e) => e.confidence >= 0.8
        ).length;

        return JSON.stringify({
          success: true,
          totalEntities,
          highConfidenceEntities,
          entitiesByType,
          entities: filteredEntities.map((e) => ({
            text: e.text,
            type: e.type,
            confidence: e.confidence,
            normalizedCode: e.normalizedCode,
          })),
          message: `Extracted ${totalEntities} medical entities from text`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to extract entities: ${error.message}`,
        });
      }
    },
    {
      name: 'extract_entities',
      description: 'Extract medical entities from unstructured text. Identifies conditions, medications, procedures, and observations with confidence scores. Use this to analyze clinical notes or documents.',
      schema: z.object({
        text: z.string().describe('The text to extract entities from'),
        entityTypes: z
          .array(z.enum(['condition', 'medication', 'procedure', 'observation']))
          .optional()
          .describe('Filter by specific entity types'),
      }),
    }
  );

  /**
   * Normalize Entity Tool
   * Normalizes a medical entity to standard terminology codes
   */
  const normalizeEntityTool = tool(
    async ({ entity, entityType }) => {
      try {
        // Normalize entity
        const normalized = await entityExtractionService.normalizeEntity(
          entity,
          entityType
        );

        return JSON.stringify({
          success: true,
          originalEntity: entity,
          normalizedEntity: normalized,
          message: `Normalized "${entity}" to standard terminology`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to normalize entity: ${error.message}`,
        });
      }
    },
    {
      name: 'normalize_entity',
      description: 'Normalize a medical entity to standard terminology codes (SNOMED CT, RxNorm, LOINC). Use this to map free-text medical terms to standardized codes for interoperability.',
      schema: z.object({
        entity: z.string().describe('The entity text to normalize'),
        entityType: z
          .enum(['condition', 'medication', 'procedure', 'observation'])
          .describe('The type of medical entity'),
      }),
    }
  );

  /**
   * Build Graph Tool
   * Builds a medical knowledge graph for a patient or set of entities
   */
  const buildGraphTool = tool(
    async ({ patientId, entityIds }) => {
      try {
        let graphData;

        if (patientId) {
          // Build full patient graph
          graphData = await graphService.buildPatientGraph(patientId);
        } else if (entityIds && entityIds.length > 0) {
          // Build subgraph for specific entities
          graphData = await graphService.buildSubgraph(entityIds);
        } else {
          return JSON.stringify({
            success: false,
            message: 'Must provide either patientId or entityIds',
          });
        }

        // Calculate statistics
        const stats = graphService.calculateGraphStatistics(graphData);

        return JSON.stringify({
          success: true,
          graph: {
            nodeCount: graphData.metadata.nodeCount,
            edgeCount: graphData.metadata.edgeCount,
            nodes: graphData.nodes.map((n) => ({
              id: n.id,
              type: n.type,
              label: n.label,
            })),
            edges: graphData.edges.map((e) => ({
              source: e.source,
              target: e.target,
              relationship: e.relationship,
              confidence: e.confidence,
            })),
          },
          statistics: stats,
          message: `Built graph with ${graphData.metadata.nodeCount} nodes and ${graphData.metadata.edgeCount} edges`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to build graph: ${error.message}`,
        });
      }
    },
    {
      name: 'build_graph',
      description: 'Build a medical knowledge graph showing relationships between conditions, medications, procedures, and observations. Use this to visualize how different medical entities are connected for a patient.',
      schema: z.object({
        patientId: z.string().optional().describe('Build graph for a specific patient'),
        entityIds: z
          .array(z.string())
          .optional()
          .describe('Build graph for specific entities'),
      }),
    }
  );

  /**
   * Find Relationships Tool
   * Identifies relationships between medical entities
   */
  const findRelationshipsTool = tool(
    async ({ entityIds }) => {
      try {
        if (!entityIds || entityIds.length < 2) {
          return JSON.stringify({
            success: false,
            message: 'Must provide at least 2 entity IDs to find relationships',
          });
        }

        // Find relationships
        const relationships = await graphService.findRelationships(entityIds);

        // Group relationships by type
        const relationshipsByType: Record<string, number> = {};
        for (const rel of relationships) {
          relationshipsByType[rel.type] = (relationshipsByType[rel.type] || 0) + 1;
        }

        return JSON.stringify({
          success: true,
          totalRelationships: relationships.length,
          relationshipsByType,
          relationships: relationships.map((r) => ({
            sourceId: r.sourceId,
            targetId: r.targetId,
            type: r.type,
            confidence: r.confidence,
            description: r.description,
          })),
          message: `Found ${relationships.length} relationships between entities`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to find relationships: ${error.message}`,
        });
      }
    },
    {
      name: 'find_relationships',
      description: 'Find relationships between medical entities (e.g., medication treats condition, observation indicates condition). Use this to understand how different medical concepts are connected.',
      schema: z.object({
        entityIds: z
          .array(z.string())
          .describe('Array of entity IDs to find relationships between'),
      }),
    }
  );

  /**
   * Query Graph Tool
   * Queries the knowledge graph with filters
   */
  const queryGraphTool = tool(
    async ({
      patientId,
      entityIds,
      entityTypes,
      relationshipTypes,
      maxDepth,
    }) => {
      try {
        const query: GraphQuery = {
          patientId,
          entityIds,
          entityTypes,
          relationshipTypes,
          maxDepth,
        };

        const graphData = await graphService.queryGraph(query);

        // Calculate statistics
        const stats = graphService.calculateGraphStatistics(graphData);

        return JSON.stringify({
          success: true,
          graph: {
            nodeCount: graphData.metadata.nodeCount,
            edgeCount: graphData.metadata.edgeCount,
            nodes: graphData.nodes.map((n) => ({
              id: n.id,
              type: n.type,
              label: n.label,
            })),
            edges: graphData.edges.map((e) => ({
              source: e.source,
              target: e.target,
              relationship: e.relationship,
              confidence: e.confidence,
            })),
          },
          statistics: stats,
          message: `Query returned ${graphData.metadata.nodeCount} nodes and ${graphData.metadata.edgeCount} edges`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to query graph: ${error.message}`,
        });
      }
    },
    {
      name: 'query_graph',
      description: 'Query the medical knowledge graph with filters. Use this to find specific subsets of the graph based on entity types, relationship types, or specific entities.',
      schema: z.object({
        patientId: z.string().optional().describe('Filter by patient ID'),
        entityIds: z.array(z.string()).optional().describe('Filter by specific entity IDs'),
        entityTypes: z
          .array(z.enum(['condition', 'medication', 'procedure', 'observation', 'patient']))
          .optional()
          .describe('Filter by entity types'),
        relationshipTypes: z
          .array(z.string())
          .optional()
          .describe('Filter by relationship types (e.g., treats, causes, indicates)'),
        maxDepth: z.number().optional().describe('Maximum traversal depth'),
      }),
    }
  );

  /**
   * Find Path Tool
   * Finds the shortest path between two entities in the graph
   */
  const findPathTool = tool(
    async ({ patientId, sourceEntityId, targetEntityId }) => {
      try {
        // Build patient graph
        const graphData = await graphService.buildPatientGraph(patientId);

        // Find shortest path
        const path = graphService.findShortestPath(
          graphData,
          sourceEntityId,
          targetEntityId
        );

        if (!path) {
          return JSON.stringify({
            success: true,
            pathFound: false,
            message: `No path found between ${sourceEntityId} and ${targetEntityId}`,
          });
        }

        // Get node details for path
        const pathNodes = path.map((nodeId) => {
          const node = graphData.nodes.find((n) => n.id === nodeId);
          return node
            ? { id: node.id, type: node.type, label: node.label }
            : { id: nodeId, type: 'unknown', label: 'Unknown' };
        });

        return JSON.stringify({
          success: true,
          pathFound: true,
          pathLength: path.length - 1,
          path: pathNodes,
          message: `Found path of length ${path.length - 1} between entities`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to find path: ${error.message}`,
        });
      }
    },
    {
      name: 'find_path',
      description: 'Find the shortest path between two medical entities in the knowledge graph. Use this to understand how two medical concepts are connected through intermediate relationships.',
      schema: z.object({
        patientId: z.string().describe('The patient whose graph to search'),
        sourceEntityId: z.string().describe('Starting entity ID'),
        targetEntityId: z.string().describe('Target entity ID'),
      }),
    }
  );

  return {
    extractEntitiesTool,
    normalizeEntityTool,
    buildGraphTool,
    findRelationshipsTool,
    queryGraphTool,
    findPathTool,
  };
}
