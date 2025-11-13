# Intelligent Medical Assistant Agents

This directory contains specialized AI agents built with LangChain.js for the Intelligent Medical Assistant system.

## Overview

The system uses an agentic architecture with specialized agents for different tasks:

1. **Upload Agent** - Processes document uploads
2. **Query Agent** - Answers natural language queries
3. **Edit Agent** - Modifies documents safely
4. **Delete Agent** - Removes documents with proper safeguards
5. **Visualization Agent** - Generates medical knowledge graphs

## Architecture

Each agent follows the same pattern:

- **LLM-powered reasoning** using GPT-4
- **Tool calling** for specific operations
- **Self-correction** when errors occur
- **Reasoning loops** for complex tasks
- **Audit logging** for all operations

## Agent Details

### Upload Agent

**Purpose**: Process medical document uploads through natural language or file interface.

**Key Features**:
- Identifies document type (FHIR, PDF, text, markdown)
- Validates FHIR resources against R4 specification
- Extracts medical entities from text
- Stores documents with encryption
- Indexes documents for search

**Usage**:
```typescript
import { UploadAgent } from './agents';

const agent = new UploadAgent({
  documentService,
  fhirService,
  entityExtractionService,
  embeddingService,
  searchService,
  openaiApiKey: process.env.OPENAI_API_KEY,
});

// Natural language upload
const result = await agent.processNaturalLanguageUpload(
  "Here's my lab report: Hemoglobin 14.2 g/dL...",
  patientId,
  userId
);

// File upload
const result = await agent.processFileUpload(
  fileContent,
  fileName,
  mimeType,
  patientId,
  userId
);
```

### Query Agent

**Purpose**: Answer natural language questions about medical documents.

**Key Features**:
- Interprets natural language queries
- Executes hybrid search (keyword + semantic)
- Synthesizes answers from multiple documents
- Cites sources with document IDs
- Refines queries if results are insufficient
- Requests clarification for ambiguous queries

**Usage**:
```typescript
import { QueryAgent } from './agents';

const agent = new QueryAgent({
  searchService,
  embeddingService,
  documentService,
  openaiApiKey: process.env.OPENAI_API_KEY,
});

const result = await agent.processQuery(
  "What medications am I taking for my heart condition?",
  patientId,
  userId
);

console.log(result.answer);
console.log(result.sources); // Document citations
console.log(result.confidence); // 0-1 confidence score
```

### Edit Agent

**Purpose**: Modify medical documents safely through natural language or structured updates.

**Key Features**:
- Identifies target document from natural language
- Validates FHIR edits against R4 specification
- Previews changes before applying
- Requests confirmation for critical changes
- Maintains audit logs
- Re-indexes documents after edits

**Usage**:
```typescript
import { EditAgent } from './agents';

const agent = new EditAgent({
  documentService,
  fhirService,
  searchService,
  embeddingService,
  openaiApiKey: process.env.OPENAI_API_KEY,
});

// Natural language edit
const result = await agent.processNaturalLanguageEdit(
  "Update my blood pressure medication dosage to 20mg",
  patientId,
  userId,
  confirmed // true if user confirmed
);

// Structured edit
const result = await agent.processStructuredEdit(
  documentId,
  { extractedText: "Updated content", tags: ["updated"] }
);
```

### Delete Agent

**Purpose**: Remove medical documents with proper safeguards.

**Key Features**:
- Identifies documents from natural language
- Assesses deletion impact
- Requests confirmation for:
  - Bulk deletes
  - Critical documents
  - Recent documents
- Removes from database and search index
- Creates audit log entries

**Usage**:
```typescript
import { DeleteAgent } from './agents';

const agent = new DeleteAgent({
  documentService,
  searchService,
  openaiApiKey: process.env.OPENAI_API_KEY,
});

// Natural language delete
const result = await agent.processNaturalLanguageDelete(
  "Delete my old lab results from 2020",
  patientId,
  userId,
  confirmed // true if user confirmed
);

// Direct delete
const result = await agent.processDirectDelete(
  documentId,
  userId,
  confirmed
);
```

### Visualization Agent

**Purpose**: Generate medical knowledge graphs from documents.

**Key Features**:
- Extracts medical entities from documents
- Builds graph with nodes (conditions, medications, procedures, observations)
- Identifies relationships (e.g., "medication treats condition")
- Evaluates graph quality
- Suggests improvements for incomplete graphs

**Usage**:
```typescript
import { VisualizationAgent } from './agents';

const agent = new VisualizationAgent({
  entityExtractionService,
  graphService,
  searchService,
  documentService,
  openaiApiKey: process.env.OPENAI_API_KEY,
});

const result = await agent.generateGraph(
  "Show me how my diabetes medications relate to my conditions",
  patientId,
  userId
);

console.log(result.graph); // GraphData with nodes and edges
console.log(result.qualityScore); // 0-1 quality score
console.log(result.suggestions); // Improvement suggestions
```

## Agent Tools

Each agent has access to specialized tools:

### Upload Agent Tools
- `identify_document_type` - Determine document format
- `validate_fhir_document` - Validate FHIR resources
- `extract_text_content` - Extract text from various formats
- `extract_medical_entities` - Extract medical entities
- `store_document` - Store in database and index

### Query Agent Tools
- `hybrid_search` - Search with keyword + semantic
- `semantic_search` - Vector-based search
- `keyword_search` - Text-based search
- `get_document_details` - Retrieve full document
- `refine_query` - Improve query based on results

### Edit Agent Tools
- `search_documents` - Find target document
- `get_document` - Retrieve document details
- `validate_fhir_edit` - Validate FHIR changes
- `preview_changes` - Show before/after
- `apply_edit` - Apply changes
- `assess_risk` - Evaluate change risk

### Delete Agent Tools
- `search_documents` - Find documents to delete
- `get_document` - Retrieve document details
- `assess_delete_impact` - Evaluate deletion impact
- `delete_document` - Delete single document
- `bulk_delete` - Delete multiple documents

### Visualization Agent Tools
- `search_relevant_documents` - Find relevant documents
- `extract_entities_from_documents` - Extract entities
- `build_graph` - Build graph structure
- `find_relationships` - Identify entity relationships
- `evaluate_graph_quality` - Assess graph quality
- `suggest_improvements` - Recommend improvements

## Reasoning and Self-Correction

All agents follow a reasoning loop:

1. **Observe** - Receive user input or tool result
2. **Reason** - Analyze situation and determine next action
3. **Act** - Execute action (call tool or route to sub-agent)
4. **Evaluate** - Assess outcome
5. **Reflect** - Determine if correction needed
6. **Correct** - Adjust approach and retry if needed

Example reasoning flow:
```
User: "Upload my recent blood test results"
→ Reason: User wants to upload a document, likely FHIR or text
→ Act: Call identify_document_type tool
→ Observe: Document is FHIR format
→ Reason: Need to validate FHIR resource
→ Act: Call validate_fhir_document tool
→ Observe: Validation failed - missing patient ID
→ Reflect: Initial action failed, need more information
→ Correct: Ask user for patient ID
```

## Configuration

All agents require:

- **Service dependencies** (DocumentService, SearchService, etc.)
- **OpenAI API key** for LLM access
- **Model name** (default: gpt-4)
- **Temperature** (default: 0 for deterministic responses)

Example configuration:
```typescript
const config = {
  documentService,
  fhirService,
  searchService,
  embeddingService,
  entityExtractionService,
  graphService,
  openaiApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',
  temperature: 0,
};
```

## Error Handling

All agents return structured results with:

- `success` - Boolean indicating success/failure
- `message` - Human-readable message
- `reasoning` - Agent's reasoning process (for debugging)
- Additional fields specific to each agent

Example error handling:
```typescript
const result = await agent.processQuery(query, patientId, userId);

if (!result.success) {
  console.error('Query failed:', result.message);
  console.error('Reasoning:', result.reasoning);
  return;
}

// Process successful result
console.log('Answer:', result.answer);
console.log('Sources:', result.sources);
```

## Testing

Each agent should be tested with:

1. **Unit tests** - Test individual methods with mocked dependencies
2. **Integration tests** - Test with real services
3. **Reasoning tests** - Verify agent can break down complex tasks
4. **Tool calling tests** - Test tool selection and parameter extraction
5. **Self-correction tests** - Test error recovery mechanisms

## Performance Considerations

- **Reasoning loops** are limited to 10 iterations max
- **Tool calls** add ~500ms-1s per call
- **LLM calls** add ~500ms-1s per call
- Use **streaming** for real-time responses
- **Cache** common queries and embeddings

## Security

- All agents log operations for audit trails
- Sensitive data is encrypted at rest
- FHIR validation prevents malformed data
- Confirmation required for critical operations
- User authentication required for all operations

## Future Enhancements

- Fine-tune LLM for medical domain
- Add specialized medical NER models
- Implement multi-turn conversation refinement
- Add support for more document formats
- Enhance relationship extraction with medical ontologies
- Add support for clinical decision support

## References

- [LangChain.js Documentation](https://js.langchain.com/)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraphjs/)
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [OpenAI API Documentation](https://platform.openai.com/docs/)
