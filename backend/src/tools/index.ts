/**
 * LangChain Tools Index
 * Exports all tool creation functions for use in agents
 */

export { createDocumentTools } from './document.tools.js';
export { createFHIRTools } from './fhir.tools.js';
export { createSearchTools } from './search.tools.js';
export { createGraphTools } from './graph.tools.js';
export { createMemoryTools } from './memory.tools.js';

/**
 * Create all tools with service dependencies
 */
export function createAllTools(services: {
  documentService: any;
  searchService: any;
  embeddingService: any;
  fhirService: any;
  entityExtractionService: any;
  graphService: any;
  memoryService: any;
}) {
  const {
    documentService,
    searchService,
    embeddingService,
    fhirService,
    entityExtractionService,
    graphService,
    memoryService,
  } = services;

  // Create document tools
  const documentTools = createDocumentTools(
    documentService,
    searchService,
    embeddingService
  );

  // Create FHIR tools
  const fhirTools = createFHIRTools(fhirService);

  // Create search tools
  const searchTools = createSearchTools(searchService, embeddingService);

  // Create graph tools
  const graphTools = createGraphTools(entityExtractionService, graphService);

  // Create memory tools
  const memoryTools = createMemoryTools(memoryService);

  // Return all tools as a flat array for agent use
  return [
    // Document operations
    documentTools.searchDocumentsTool,
    documentTools.getDocumentTool,
    documentTools.createDocumentTool,
    documentTools.updateDocumentTool,
    documentTools.deleteDocumentTool,

    // FHIR operations
    fhirTools.validateFHIRTool,
    fhirTools.parseFHIRBundleTool,
    fhirTools.extractFHIRResourcesTool,
    fhirTools.createFHIRBundleTool,

    // Search operations
    searchTools.semanticSearchTool,
    searchTools.hybridSearchTool,
    searchTools.advancedSearchTool,
    searchTools.searchSimilarDocumentsTool,

    // Entity and graph operations
    graphTools.extractEntitiesTool,
    graphTools.normalizeEntityTool,
    graphTools.buildGraphTool,
    graphTools.findRelationshipsTool,
    graphTools.queryGraphTool,
    graphTools.findPathTool,

    // Memory operations
    memoryTools.getConversationContextTool,
    memoryTools.updateWorkingMemoryTool,
    memoryTools.addMessageTool,
    memoryTools.listConversationsTool,
    memoryTools.generateSummaryTool,
    memoryTools.clearWorkingMemoryTool,
  ];
}

/**
 * Get tools by category
 */
export function getToolsByCategory(services: any) {
  const {
    documentService,
    searchService,
    embeddingService,
    fhirService,
    entityExtractionService,
    graphService,
    memoryService,
  } = services;

  return {
    document: createDocumentTools(documentService, searchService, embeddingService),
    fhir: createFHIRTools(fhirService),
    search: createSearchTools(searchService, embeddingService),
    graph: createGraphTools(entityExtractionService, graphService),
    memory: createMemoryTools(memoryService),
  };
}
