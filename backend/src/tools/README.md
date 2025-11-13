# LangChain Tools for Intelligent Medical Assistant

This directory contains LangChain tools that enable AI agents to interact with the medical document system. All tools are implemented using the `@langchain/core/tools` framework with Zod schemas for type-safe parameter validation.

## Overview

The tools are organized into five categories:

1. **Document Operations** - CRUD operations for medical documents
2. **FHIR Operations** - Validation and parsing of FHIR resources
3. **Search Operations** - Semantic and hybrid search capabilities
4. **Entity & Graph Operations** - Medical entity extraction and knowledge graph building
5. **Memory Operations** - Conversation context and working memory management

## Tool Categories

### 1. Document Operations (`document.tools.ts`)

Tools for managing medical documents with encryption, indexing, and audit logging.

#### `search_documents`
Search for medical documents using keyword search.
- **Parameters**: query, patientId?, documentType?, dateRange?, limit?
- **Returns**: Document metadata and highlights
- **Use Case**: Find documents by content, filename, or tags

#### `get_document`
Retrieve a specific document by ID.
- **Parameters**: documentId, userId
- **Returns**: Full document details including content and metadata
- **Use Case**: Access complete document information

#### `create_document`
Create a new medical document.
- **Parameters**: patientId, documentType, uploadMethod, userId, fhirResource?, extractedText?, etc.
- **Returns**: Document ID
- **Use Case**: Store FHIR resources, clinical notes, or other medical documents
- **Note**: Automatically encrypts PHI and indexes for search

#### `update_document`
Update an existing medical document.
- **Parameters**: documentId, userId, fhirResource?, extractedText?, metadata?, tags?
- **Returns**: Updated document with new version
- **Use Case**: Modify document content or metadata
- **Note**: Creates new version and maintains audit trail

#### `delete_document`
Delete a medical document permanently.
- **Parameters**: documentId, userId
- **Returns**: Success status
- **Use Case**: Remove documents from storage and search index
- **Note**: Creates audit log entry before deletion

### 2. FHIR Operations (`fhir.tools.ts`)

Tools for working with HL7 FHIR R4 resources.

#### `validate_fhir`
Validate a FHIR resource against R4 specification.
- **Parameters**: resource, resourceType
- **Returns**: Validation result with errors and warnings
- **Use Case**: Check FHIR resource validity before storing

#### `parse_fhir_bundle`
Extract individual resources from a FHIR Bundle.
- **Parameters**: bundle
- **Returns**: Resource summary and patient references
- **Use Case**: Process FHIR documents with multiple resources

#### `extract_fhir_resources`
Extract and validate resources from any FHIR document.
- **Parameters**: fhirDocument
- **Returns**: Validation results for each resource
- **Use Case**: Process and validate FHIR documents

#### `create_fhir_bundle`
Create a FHIR Bundle from individual resources.
- **Parameters**: resources, bundleType?
- **Returns**: FHIR Bundle
- **Use Case**: Package multiple resources into a Bundle

### 3. Search Operations (`search.tools.ts`)

Tools for finding documents using various search methods.

#### `semantic_search`
Perform vector-based semantic search.
- **Parameters**: query, patientId?, documentType?, dateRange?, limit?
- **Returns**: Semantically similar documents
- **Use Case**: Find conceptually related documents
- **Note**: Uses embeddings to understand meaning and context

#### `hybrid_search`
Combine keyword and semantic search.
- **Parameters**: query, patientId?, documentType?, dateRange?, limit?
- **Returns**: Documents matching keywords or semantics
- **Use Case**: Best general-purpose search method
- **Note**: Balances exact matches with conceptual similarity

#### `advanced_search`
Search with fine-grained control over filters.
- **Parameters**: query, patientId?, documentType?, tags?, fhirResourceType?, searchMethod?
- **Returns**: Filtered search results
- **Use Case**: Complex queries with specific requirements

#### `search_similar_documents`
Find documents similar to a given document.
- **Parameters**: documentId, userId, limit?
- **Returns**: Similar documents
- **Use Case**: Discover related medical records

### 4. Entity & Graph Operations (`graph.tools.ts`)

Tools for extracting medical entities and building knowledge graphs.

#### `extract_entities`
Extract medical entities from text.
- **Parameters**: text, entityTypes?
- **Returns**: Conditions, medications, procedures, observations
- **Use Case**: Analyze clinical notes or unstructured documents
- **Note**: Provides confidence scores and normalized codes

#### `normalize_entity`
Normalize entity to standard terminology.
- **Parameters**: entity, entityType
- **Returns**: Standardized codes (SNOMED CT, RxNorm, LOINC)
- **Use Case**: Map free-text terms to standard codes

#### `build_graph`
Build a medical knowledge graph.
- **Parameters**: patientId? OR entityIds?
- **Returns**: Graph with nodes and edges
- **Use Case**: Visualize relationships between medical entities

#### `find_relationships`
Identify relationships between entities.
- **Parameters**: entityIds
- **Returns**: Relationships with confidence scores
- **Use Case**: Understand how medical concepts are connected

#### `query_graph`
Query knowledge graph with filters.
- **Parameters**: patientId?, entityIds?, entityTypes?, relationshipTypes?, maxDepth?
- **Returns**: Filtered subgraph
- **Use Case**: Find specific patterns in medical data

#### `find_path`
Find shortest path between two entities.
- **Parameters**: patientId, sourceEntityId, targetEntityId
- **Returns**: Path through graph
- **Use Case**: Understand connections between medical concepts

### 5. Memory Operations (`memory.tools.ts`)

Tools for managing conversation context and agent memory.

#### `get_conversation_context`
Retrieve conversation context.
- **Parameters**: conversationId
- **Returns**: Recent messages, summary, working memory
- **Use Case**: Understand current conversation state

#### `update_working_memory`
Update agent working memory.
- **Parameters**: conversationId, agentType?, currentTask?, observation?, reasoning?, reflection?
- **Returns**: Success status
- **Use Case**: Track agent thought process during task execution

#### `add_message`
Add message to conversation history.
- **Parameters**: conversationId, role, content, metadata?, toolCalls?, reasoning?
- **Returns**: Success status
- **Use Case**: Record messages in long-term memory

#### `list_conversations`
List conversations with filters.
- **Parameters**: userId, patientId?, archived?, startDate?, endDate?, limit?
- **Returns**: Conversation list
- **Use Case**: Find past conversations

#### `generate_summary`
Generate conversation summary.
- **Parameters**: conversationId
- **Returns**: Summary text
- **Use Case**: Create concise conversation overview

#### `clear_working_memory`
Clear working memory.
- **Parameters**: conversationId
- **Returns**: Success status
- **Use Case**: Reset memory when starting new task

## Usage

### Basic Usage

```typescript
import { createAllTools } from './tools/index.js';

// Initialize services
const services = {
  documentService,
  searchService,
  embeddingService,
  fhirService,
  entityExtractionService,
  graphService,
  memoryService,
};

// Create all tools
const tools = createAllTools(services);

// Use with LangChain agent
import { createAgent } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';

const model = new ChatOpenAI({ modelName: 'gpt-4', temperature: 0 });

const agent = await createAgent({
  llm: model,
  tools: tools,
  messageModifier: 'You are a medical assistant...',
});
```

### Category-Specific Usage

```typescript
import { getToolsByCategory } from './tools/index.js';

const toolsByCategory = getToolsByCategory(services);

// Use only document tools
const documentAgent = await createAgent({
  llm: model,
  tools: Object.values(toolsByCategory.document),
});

// Use only search tools
const searchAgent = await createAgent({
  llm: model,
  tools: Object.values(toolsByCategory.search),
});
```

### Individual Tool Usage

```typescript
import { createDocumentTools } from './tools/document.tools.js';

const { searchDocumentsTool, getDocumentTool } = createDocumentTools(
  documentService,
  searchService,
  embeddingService
);

// Use specific tools
const queryAgent = await createAgent({
  llm: model,
  tools: [searchDocumentsTool, getDocumentTool],
});
```

## Tool Design Principles

### 1. Type Safety
All tools use Zod schemas for parameter validation, ensuring type safety and clear documentation.

### 2. Error Handling
Tools return JSON-formatted responses with success/failure status and descriptive error messages.

### 3. Security
- Document tools enforce user authentication
- PHI is automatically encrypted
- Audit logs are created for sensitive operations

### 4. Performance
- Search tools support pagination
- Embeddings are cached in Redis
- Working memory uses Redis for hot data

### 5. Observability
All tool calls can be traced using LangSmith for debugging and monitoring.

## Integration with Agents

### Upload Agent
Uses: `create_document`, `validate_fhir`, `extract_entities`, `parse_fhir_bundle`

### Query Agent
Uses: `hybrid_search`, `semantic_search`, `get_document`, `get_conversation_context`

### Edit Agent
Uses: `get_document`, `update_document`, `validate_fhir`

### Delete Agent
Uses: `search_documents`, `delete_document`, `get_document`

### Visualization Agent
Uses: `build_graph`, `find_relationships`, `extract_entities`, `query_graph`

### Supervisor Agent
Uses: All tools for routing and coordination

## Testing

Tools can be tested independently:

```typescript
// Test document search
const result = await searchDocumentsTool.invoke({
  query: 'diabetes medication',
  patientId: 'patient-123',
  limit: 5,
});

console.log(JSON.parse(result));
```

## Future Enhancements

1. **Batch Operations**: Add tools for bulk document operations
2. **Advanced Analytics**: Tools for statistical analysis of medical data
3. **Real-time Monitoring**: Tools for tracking vital signs and alerts
4. **Integration Tools**: Direct EHR system integration tools
5. **Audit Tools**: Enhanced audit log querying and reporting

## Requirements Mapping

This implementation satisfies the following requirements:

- **Requirement 1.4, 1.5**: Document CRUD operations
- **Requirement 2.1**: Natural language querying
- **Requirement 4.1, 4.4**: Document editing and deletion
- **Requirement 6.2, 9.2**: FHIR validation and parsing
- **Requirement 2.2, 2.3, 7.12**: Semantic and hybrid search
- **Requirement 5.1, 5.2, 9.4**: Entity extraction and graph building
- **Requirement 10.4**: Conversation context and memory management

## Dependencies

- `@langchain/core`: Tool framework
- `zod`: Schema validation
- Service layer: DocumentService, SearchService, FHIRService, etc.

## License

Part of the Intelligent Medical Assistant system.
