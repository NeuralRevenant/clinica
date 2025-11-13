/**
 * Example Usage of LangChain Tools
 * Demonstrates how to use the tools with LangChain agents
 */

import { ChatOpenAI } from '@langchain/openai';
import { createAllTools, getToolsByCategory } from './index.js';

/**
 * Example 1: Create an agent with all tools
 */
export async function createFullAgent(services: any) {
  const model = new ChatOpenAI({
    modelName: 'gpt-4',
    temperature: 0,
  });

  const tools = createAllTools(services);

  // Note: This is a simplified example
  // In production, use createAgent from @langchain/langgraph
  console.log(`Created agent with ${tools.length} tools`);
  
  return {
    model,
    tools,
  };
}

/**
 * Example 2: Create specialized agents for different tasks
 */
export async function createSpecializedAgents(services: any) {
  const model = new ChatOpenAI({
    modelName: 'gpt-4',
    temperature: 0,
  });

  const toolsByCategory = getToolsByCategory(services);

  // Upload Agent - handles document uploads
  const uploadAgent = {
    model,
    tools: [
      ...Object.values(toolsByCategory.document),
      ...Object.values(toolsByCategory.fhir),
      toolsByCategory.graph.extractEntitiesTool,
    ],
  };

  // Query Agent - handles search and retrieval
  const queryAgent = {
    model,
    tools: [
      ...Object.values(toolsByCategory.search),
      toolsByCategory.document.getDocumentTool,
      toolsByCategory.memory.getConversationContextTool,
    ],
  };

  // Edit Agent - handles document modifications
  const editAgent = {
    model,
    tools: [
      toolsByCategory.document.getDocumentTool,
      toolsByCategory.document.updateDocumentTool,
      toolsByCategory.fhir.validateFHIRTool,
    ],
  };

  // Delete Agent - handles document deletion
  const deleteAgent = {
    model,
    tools: [
      toolsByCategory.document.searchDocumentsTool,
      toolsByCategory.document.getDocumentTool,
      toolsByCategory.document.deleteDocumentTool,
    ],
  };

  // Visualization Agent - handles graph generation
  const visualizationAgent = {
    model,
    tools: [
      ...Object.values(toolsByCategory.graph),
      toolsByCategory.search.hybridSearchTool,
    ],
  };

  return {
    uploadAgent,
    queryAgent,
    editAgent,
    deleteAgent,
    visualizationAgent,
  };
}

/**
 * Example 3: Direct tool invocation
 */
export async function directToolUsage(services: any) {
  const tools = createAllTools(services);

  // Find the search tool
  const searchTool = tools.find((t) => t.name === 'search_documents');

  if (searchTool) {
    // Invoke the tool directly
    const result = await searchTool.invoke({
      query: 'diabetes medication',
      patientId: 'patient-123',
      limit: 5,
    });

    console.log('Search results:', JSON.parse(result));
  }
}

/**
 * Example 4: Tool usage in agent workflow
 */
export async function agentWorkflowExample(services: any) {
  const toolsByCategory = getToolsByCategory(services);

  // Simulate an agent workflow for document upload
  const uploadWorkflow = async (
    fhirBundle: any,
    patientId: string,
    userId: string
  ) => {
    // Step 1: Validate FHIR Bundle
    const validationResult = await toolsByCategory.fhir.validateFHIRTool.invoke({
      resource: fhirBundle,
      resourceType: 'Bundle',
    });

    const validation = JSON.parse(validationResult);
    if (!validation.isValid) {
      console.error('FHIR validation failed:', validation.errors);
      return { success: false, errors: validation.errors };
    }

    // Step 2: Parse Bundle
    const parseResult = await toolsByCategory.fhir.parseFHIRBundleTool.invoke({
      bundle: fhirBundle,
    });

    const parsed = JSON.parse(parseResult);
    console.log(`Parsed ${parsed.totalResources} resources`);

    // Step 3: Create documents for each resource
    const documentIds: string[] = [];
    for (const resource of parsed.resources) {
      const createResult = await toolsByCategory.document.createDocumentTool.invoke({
        patientId,
        documentType: 'fhir',
        uploadMethod: 'fileUpload',
        userId,
        fhirResourceType: resource.resourceType,
        fhirResource: resource,
      });

      const created = JSON.parse(createResult);
      if (created.success) {
        documentIds.push(created.documentId);
      }
    }

    return {
      success: true,
      documentIds,
      resourceCount: parsed.totalResources,
    };
  };

  return uploadWorkflow;
}

/**
 * Example 5: Memory management in conversation
 */
export async function memoryManagementExample(services: any) {
  const toolsByCategory = getToolsByCategory(services);
  const conversationId = 'conv_123';

  // Get current context
  const contextResult = await toolsByCategory.memory.getConversationContextTool.invoke({
    conversationId,
  });

  const context = JSON.parse(contextResult);
  console.log('Current context:', context);

  // Update working memory with observation
  await toolsByCategory.memory.updateWorkingMemoryTool.invoke({
    conversationId,
    agentType: 'query',
    currentTask: 'Searching for patient medications',
    taskState: 'executing',
    observation: {
      text: 'Found 3 medication records',
      source: 'search_tool',
    },
  });

  // Add reasoning step
  await toolsByCategory.memory.updateWorkingMemoryTool.invoke({
    conversationId,
    reasoning: {
      thought: 'User asked about current medications',
      decision: 'Search for active medications only',
    },
  });

  // Generate summary when done
  const summaryResult = await toolsByCategory.memory.generateSummaryTool.invoke({
    conversationId,
  });

  const summary = JSON.parse(summaryResult);
  console.log('Conversation summary:', summary.summary);
}

/**
 * Example 6: Graph building and querying
 */
export async function graphExample(services: any) {
  const toolsByCategory = getToolsByCategory(services);
  const patientId = 'patient-123';

  // Build patient graph
  const graphResult = await toolsByCategory.graph.buildGraphTool.invoke({
    patientId,
  });

  const graph = JSON.parse(graphResult);
  console.log(`Built graph with ${graph.graph.nodeCount} nodes`);

  // Find relationships
  const entityIds = graph.graph.nodes.slice(0, 5).map((n: any) => n.id);
  const relationshipsResult = await toolsByCategory.graph.findRelationshipsTool.invoke({
    entityIds,
  });

  const relationships = JSON.parse(relationshipsResult);
  console.log(`Found ${relationships.totalRelationships} relationships`);

  // Query graph for specific entity types
  const queryResult = await toolsByCategory.graph.queryGraphTool.invoke({
    patientId,
    entityTypes: ['condition', 'medication'],
    relationshipTypes: ['treats'],
  });

  const queryGraph = JSON.parse(queryResult);
  console.log('Filtered graph:', queryGraph);
}

/**
 * Example 7: Hybrid search workflow
 */
export async function searchWorkflowExample(services: any) {
  const toolsByCategory = getToolsByCategory(services);

  // Start with hybrid search
  const searchResult = await toolsByCategory.search.hybridSearchTool.invoke({
    query: 'recent blood pressure readings',
    patientId: 'patient-123',
    documentType: 'fhir',
    limit: 10,
  });

  const results = JSON.parse(searchResult);
  console.log(`Found ${results.total} documents`);

  // Get full details for top result
  if (results.results.length > 0) {
    const topResult = results.results[0];
    const docResult = await toolsByCategory.document.getDocumentTool.invoke({
      documentId: topResult.documentId,
      userId: 'user-123',
    });

    const document = JSON.parse(docResult);
    console.log('Top document:', document.document);
  }

  // Extract entities from results
  for (const result of results.results.slice(0, 3)) {
    if (result.highlights && result.highlights.length > 0) {
      const entitiesResult = await toolsByCategory.graph.extractEntitiesTool.invoke({
        text: result.highlights[0],
        entityTypes: ['observation'],
      });

      const entities = JSON.parse(entitiesResult);
      console.log(`Extracted ${entities.totalEntities} entities from highlight`);
    }
  }
}
