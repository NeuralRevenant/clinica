import { Db } from 'mongodb';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

export interface GraphNode {
  id: string;
  type: 'condition' | 'medication' | 'procedure' | 'observation' | 'patient';
  label: string;
  properties: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  weight: number;
  confidence: number;
  properties?: Record<string, any>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: GraphMetadata;
}

export interface GraphMetadata {
  patientId?: string;
  generatedAt: Date;
  nodeCount: number;
  edgeCount: number;
  reasoning?: string;
  qualityScore?: number;
}

export interface Relationship {
  sourceId: string;
  targetId: string;
  type: string;
  confidence: number;
  description?: string;
}

export interface GraphQuery {
  patientId?: string;
  entityIds?: string[];
  entityTypes?: string[];
  relationshipTypes?: string[];
  maxDepth?: number;
}

// Zod schema for relationship extraction
const RelationshipSchema = z.object({
  relationships: z.array(
    z.object({
      sourceEntity: z.string().describe('The source entity text'),
      targetEntity: z.string().describe('The target entity text'),
      relationshipType: z.string().describe('Type of relationship (treats, causes, indicates, monitors, etc.)'),
      confidence: z.number().min(0).max(1).describe('Confidence in this relationship'),
      description: z.string().optional().describe('Brief description of the relationship'),
    })
  ),
});

/**
 * Graph Service - Builds and queries medical knowledge graphs
 * Extracts relationships between medical entities and provides graph traversal
 */
export class GraphService {
  private db: Db;
  private llm: ChatOpenAI;

  constructor(db: Db, openaiApiKey: string, modelName: string = 'gpt-4') {
    this.db = db;
    this.llm = new ChatOpenAI({
      openAIApiKey: openaiApiKey,
      modelName: modelName,
      temperature: 0,
    });
  }

  /**
   * Build a patient's medical knowledge graph
   */
  async buildPatientGraph(patientId: string): Promise<GraphData> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Add patient node
    const patient = await this.db.collection('patients').findOne({ patientId });
    if (patient) {
      nodes.push({
        id: patientId,
        type: 'patient',
        label: this.getPatientName(patient),
        properties: {
          gender: patient.gender,
          birthDate: patient.birthDate,
        },
      });
    }

    // Get all medical data for patient
    const conditions = await this.db
      .collection('conditions')
      .find({ patientId })
      .toArray();

    const medications = await this.db
      .collection('medications')
      .find({ patientId })
      .toArray();

    const observations = await this.db
      .collection('observations')
      .find({ patientId })
      .toArray();

    const procedures = await this.db
      .collection('procedures')
      .find({ patientId })
      .toArray();

    // Add condition nodes
    for (const condition of conditions) {
      nodes.push({
        id: condition.conditionId,
        type: 'condition',
        label: this.getCodeDisplay(condition.code),
        properties: {
          clinicalStatus: condition.clinicalStatus,
          severity: condition.severity,
          onsetDate: condition.onsetDateTime,
        },
      });

      // Link to patient
      edges.push({
        source: patientId,
        target: condition.conditionId,
        relationship: 'has_condition',
        weight: 1.0,
        confidence: 1.0,
      });
    }

    // Add medication nodes
    for (const medication of medications) {
      nodes.push({
        id: medication.medicationId,
        type: 'medication',
        label: this.getCodeDisplay(medication.code),
        properties: {
          dosage: medication.dosage?.text,
          status: medication.status,
        },
      });

      // Link to patient
      edges.push({
        source: patientId,
        target: medication.medicationId,
        relationship: 'takes_medication',
        weight: 1.0,
        confidence: 1.0,
      });
    }

    // Add observation nodes
    for (const observation of observations) {
      nodes.push({
        id: observation.observationId,
        type: 'observation',
        label: this.getCodeDisplay(observation.code),
        properties: {
          value: observation.value,
          effectiveDate: observation.effectiveDateTime,
        },
      });

      // Link to patient
      edges.push({
        source: patientId,
        target: observation.observationId,
        relationship: 'has_observation',
        weight: 1.0,
        confidence: 1.0,
      });
    }

    // Add procedure nodes
    for (const procedure of procedures) {
      nodes.push({
        id: procedure.procedureId,
        type: 'procedure',
        label: this.getCodeDisplay(procedure.code),
        properties: {
          status: procedure.status,
          performedDate: procedure.performedDateTime,
        },
      });

      // Link to patient
      edges.push({
        source: patientId,
        target: procedure.procedureId,
        relationship: 'underwent_procedure',
        weight: 1.0,
        confidence: 1.0,
      });
    }

    // Extract relationships between entities
    const entityRelationships = await this.findRelationships(
      nodes.filter((n) => n.type !== 'patient').map((n) => n.id)
    );

    // Add relationship edges
    for (const rel of entityRelationships) {
      edges.push({
        source: rel.sourceId,
        target: rel.targetId,
        relationship: rel.type,
        weight: rel.confidence,
        confidence: rel.confidence,
        properties: {
          description: rel.description,
        },
      });
    }

    return {
      nodes,
      edges,
      metadata: {
        patientId,
        generatedAt: new Date(),
        nodeCount: nodes.length,
        edgeCount: edges.length,
      },
    };
  }

  /**
   * Find relationships between medical entities
   */
  async findRelationships(entityIds: string[]): Promise<Relationship[]> {
    if (entityIds.length === 0) {
      return [];
    }

    // Fetch entities from database
    const entities = await this.fetchEntitiesByIds(entityIds);

    if (entities.length < 2) {
      return [];
    }

    // Build context for LLM
    const entityDescriptions = entities.map((e) => {
      return `- ${e.type}: ${e.label} (ID: ${e.id})`;
    }).join('\n');

    const prompt = `You are a medical knowledge graph builder. Analyze the following medical entities and identify relationships between them.

Entities:
${entityDescriptions}

Identify relationships such as:
- Medication treats Condition
- Condition causes Observation
- Observation indicates Condition
- Medication monitors Observation
- Procedure treats Condition
- etc.

For each relationship, provide:
1. Source entity (use the exact label from the list)
2. Target entity (use the exact label from the list)
3. Relationship type (e.g., "treats", "causes", "indicates", "monitors")
4. Confidence score (0-1)
5. Brief description

Only include relationships that are medically meaningful and well-supported.`;

    try {
      const llmWithStructuredOutput = this.llm.withStructuredOutput(RelationshipSchema);
      const result = await llmWithStructuredOutput.invoke(prompt);

      // Map entity labels back to IDs
      const relationships: Relationship[] = [];
      for (const rel of result.relationships) {
        const sourceEntity = entities.find((e) => e.label === rel.sourceEntity);
        const targetEntity = entities.find((e) => e.label === rel.targetEntity);

        if (sourceEntity && targetEntity) {
          relationships.push({
            sourceId: sourceEntity.id,
            targetId: targetEntity.id,
            type: rel.relationshipType,
            confidence: rel.confidence,
            description: rel.description,
          });
        }
      }

      return relationships;
    } catch (error) {
      console.error('Error finding relationships:', error);
      return [];
    }
  }

  /**
   * Query graph with filters
   */
  async queryGraph(query: GraphQuery): Promise<GraphData> {
    if (query.patientId) {
      // Build full patient graph and filter
      const fullGraph = await this.buildPatientGraph(query.patientId);
      return this.filterGraph(fullGraph, query);
    }

    if (query.entityIds && query.entityIds.length > 0) {
      // Build subgraph for specific entities
      return this.buildSubgraph(query.entityIds);
    }

    throw new Error('Query must specify either patientId or entityIds');
  }

  /**
   * Build subgraph for specific entities
   */
  async buildSubgraph(entityIds: string[]): Promise<GraphData> {
    const nodes = await this.fetchEntitiesByIds(entityIds);
    const relationships = await this.findRelationships(entityIds);

    const edges: GraphEdge[] = relationships.map((rel) => ({
      source: rel.sourceId,
      target: rel.targetId,
      relationship: rel.type,
      weight: rel.confidence,
      confidence: rel.confidence,
      properties: {
        description: rel.description,
      },
    }));

    return {
      nodes,
      edges,
      metadata: {
        generatedAt: new Date(),
        nodeCount: nodes.length,
        edgeCount: edges.length,
      },
    };
  }

  /**
   * Filter graph based on query criteria
   */
  private filterGraph(graph: GraphData, query: GraphQuery): GraphData {
    let filteredNodes = graph.nodes;
    let filteredEdges = graph.edges;

    // Filter by entity types
    if (query.entityTypes && query.entityTypes.length > 0) {
      filteredNodes = filteredNodes.filter((node) =>
        query.entityTypes!.includes(node.type)
      );
      const nodeIds = new Set(filteredNodes.map((n) => n.id));
      filteredEdges = filteredEdges.filter(
        (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
      );
    }

    // Filter by relationship types
    if (query.relationshipTypes && query.relationshipTypes.length > 0) {
      filteredEdges = filteredEdges.filter((edge) =>
        query.relationshipTypes!.includes(edge.relationship)
      );
    }

    // Filter by entity IDs
    if (query.entityIds && query.entityIds.length > 0) {
      const entityIdSet = new Set(query.entityIds);
      filteredNodes = filteredNodes.filter((node) => entityIdSet.has(node.id));
      filteredEdges = filteredEdges.filter(
        (edge) => entityIdSet.has(edge.source) || entityIdSet.has(edge.target)
      );
    }

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      metadata: {
        ...graph.metadata,
        nodeCount: filteredNodes.length,
        edgeCount: filteredEdges.length,
      },
    };
  }

  /**
   * Fetch entities by IDs from database
   */
  private async fetchEntitiesByIds(entityIds: string[]): Promise<GraphNode[]> {
    const nodes: GraphNode[] = [];

    // Try to fetch from different collections
    const collections = [
      { name: 'conditions', idField: 'conditionId', type: 'condition' as const },
      { name: 'medications', idField: 'medicationId', type: 'medication' as const },
      { name: 'observations', idField: 'observationId', type: 'observation' as const },
      { name: 'procedures', idField: 'procedureId', type: 'procedure' as const },
    ];

    for (const col of collections) {
      const docs = await this.db
        .collection(col.name)
        .find({ [col.idField]: { $in: entityIds } })
        .toArray();

      for (const doc of docs) {
        nodes.push({
          id: doc[col.idField],
          type: col.type,
          label: this.getCodeDisplay(doc.code),
          properties: doc,
        });
      }
    }

    return nodes;
  }

  /**
   * Get display text from FHIR CodeableConcept
   */
  private getCodeDisplay(code: any): string {
    if (!code) {
      return 'Unknown';
    }

    if (code.text) {
      return code.text;
    }

    if (code.coding && code.coding.length > 0) {
      return code.coding[0].display || code.coding[0].code || 'Unknown';
    }

    return 'Unknown';
  }

  /**
   * Get patient name
   */
  private getPatientName(patient: any): string {
    if (!patient.name || patient.name.length === 0) {
      return 'Unknown Patient';
    }

    const name = patient.name[0];
    const given = name.given ? name.given.join(' ') : '';
    const family = name.family || '';

    return `${given} ${family}`.trim() || 'Unknown Patient';
  }

  /**
   * Calculate graph statistics
   */
  calculateGraphStatistics(graph: GraphData): {
    nodesByType: Record<string, number>;
    edgesByRelationship: Record<string, number>;
    averageConnections: number;
    isolatedNodes: number;
  } {
    const nodesByType: Record<string, number> = {};
    const edgesByRelationship: Record<string, number> = {};
    const nodeConnections: Record<string, number> = {};

    // Count nodes by type
    for (const node of graph.nodes) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
      nodeConnections[node.id] = 0;
    }

    // Count edges by relationship and node connections
    for (const edge of graph.edges) {
      edgesByRelationship[edge.relationship] =
        (edgesByRelationship[edge.relationship] || 0) + 1;
      nodeConnections[edge.source] = (nodeConnections[edge.source] || 0) + 1;
      nodeConnections[edge.target] = (nodeConnections[edge.target] || 0) + 1;
    }

    // Calculate average connections
    const totalConnections = Object.values(nodeConnections).reduce((a, b) => a + b, 0);
    const averageConnections =
      graph.nodes.length > 0 ? totalConnections / graph.nodes.length : 0;

    // Count isolated nodes
    const isolatedNodes = Object.values(nodeConnections).filter((c) => c === 0).length;

    return {
      nodesByType,
      edgesByRelationship,
      averageConnections,
      isolatedNodes,
    };
  }

  /**
   * Find shortest path between two nodes
   */
  findShortestPath(graph: GraphData, sourceId: string, targetId: string): string[] | null {
    // Build adjacency list
    const adjacency: Record<string, string[]> = {};
    for (const node of graph.nodes) {
      adjacency[node.id] = [];
    }
    for (const edge of graph.edges) {
      adjacency[edge.source].push(edge.target);
      adjacency[edge.target].push(edge.source); // Treat as undirected
    }

    // BFS to find shortest path
    const queue: Array<{ nodeId: string; path: string[] }> = [
      { nodeId: sourceId, path: [sourceId] },
    ];
    const visited = new Set<string>([sourceId]);

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;

      if (nodeId === targetId) {
        return path;
      }

      for (const neighbor of adjacency[nodeId] || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ nodeId: neighbor, path: [...path, neighbor] });
        }
      }
    }

    return null; // No path found
  }
}
