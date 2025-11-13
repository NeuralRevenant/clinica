# Service Layer Implementation

This directory contains the core business logic services for the Intelligent Medical Assistant.

## Implemented Services

### 1. Document Service (`document.service.ts`)
**Purpose**: Manages CRUD operations for medical documents with encryption and audit logging.

**Key Features**:
- Create, read, update, delete medical documents
- AES-256 encryption for PHI fields (extractedText, fhirResource, structuredData)
- Automatic audit logging for all operations
- Document validation
- Version control
- Support for multiple document types (FHIR, PDF, text, markdown)

**Main Methods**:
- `createDocument()` - Create new document with encryption
- `getDocument()` - Retrieve and decrypt document
- `updateDocument()` - Update document with version tracking
- `deleteDocument()` - Delete with audit trail
- `listDocuments()` - Query documents with filters

### 2. Search Service (`search.service.ts`)
**Purpose**: Handles OpenSearch indexing and hybrid search operations.

**Key Features**:
- OpenSearch index management for all resource types
- Keyword search with fuzzy matching
- Semantic search using vector embeddings (knn_vector)
- Hybrid search combining keyword + semantic (40%/60% weight)
- Result ranking and highlighting
- Index synchronization with MongoDB

**Main Methods**:
- `indexDocument()` - Index document in OpenSearch
- `keywordSearch()` - Traditional text search
- `semanticSearch()` - Vector similarity search
- `hybridSearch()` - Combined keyword + semantic search
- `reindex()` - Update existing index entry
- `synchronizeIndex()` - Sync MongoDB to OpenSearch

**Indices Created**:
- `medical_documents` - Document search with embeddings
- `patients` - Patient search
- `observations` - Clinical observations
- `conditions` - Medical conditions
- `medications` - Medication records

### 3. FHIR Service (`fhir.service.ts`)
**Purpose**: Validates and parses FHIR R4 resources.

**Key Features**:
- FHIR R4 resource validation
- Bundle parsing and resource extraction
- Support for Patient, Observation, Condition, Medication, Procedure resources
- CodeableConcept validation
- Reference validation

**Main Methods**:
- `validateResource()` - Validate against FHIR R4 spec
- `parseBundle()` - Extract resources from FHIR Bundle
- `extractResources()` - Get resources from FHIR document
- `createBundle()` - Create FHIR Bundle from resources

### 4. Embedding Service (`embedding.service.ts`)
**Purpose**: Generates vector embeddings using OpenAI with Redis caching.

**Key Features**:
- OpenAI text-embedding-ada-002 model (1536 dimensions)
- Redis caching for performance (7-day TTL)
- Batch embedding generation
- Document chunking for long texts
- Cosine similarity calculation
- Cache statistics and management

**Main Methods**:
- `generateEmbedding()` - Single text embedding with caching
- `generateBatchEmbeddings()` - Batch processing
- `generateDocumentEmbedding()` - Handle long documents with chunking
- `cosineSimilarity()` - Calculate similarity between embeddings
- `clearCache()` - Cache management

### 5. Entity Extraction Service (`entity-extraction.service.ts`)
**Purpose**: Extracts medical entities from unstructured text using GPT-4.

**Key Features**:
- Medical entity recognition (conditions, medications, procedures, observations)
- Entity normalization to standard terminologies (SNOMED CT, RxNorm, LOINC, CPT)
- Confidence scoring
- Structured output using Zod schemas
- Batch processing
- Entity deduplication and filtering

**Main Methods**:
- `extractEntities()` - Extract all medical entities
- `normalizeEntity()` - Normalize to standard codes
- `extractEntitiesByType()` - Filter by entity type
- `batchExtractEntities()` - Process multiple texts
- `getEntityStatistics()` - Entity analysis

**Entity Types**:
- `condition` - Medical conditions (SNOMED CT)
- `medication` - Medications (RxNorm)
- `procedure` - Procedures (CPT/SNOMED CT)
- `observation` - Lab tests/observations (LOINC)

### 6. Graph Service (`graph.service.ts`)
**Purpose**: Builds and queries medical knowledge graphs.

**Key Features**:
- Patient medical knowledge graph construction
- Relationship extraction using GPT-4
- Graph traversal and querying
- Shortest path finding
- Graph statistics and analysis
- Subgraph generation

**Main Methods**:
- `buildPatientGraph()` - Build complete patient graph
- `findRelationships()` - Extract entity relationships
- `queryGraph()` - Query with filters
- `buildSubgraph()` - Create subgraph for specific entities
- `calculateGraphStatistics()` - Graph analysis
- `findShortestPath()` - Path finding between nodes

**Graph Elements**:
- **Nodes**: Patient, Condition, Medication, Procedure, Observation
- **Edges**: has_condition, takes_medication, underwent_procedure, treats, causes, indicates, monitors

### 7. Memory Service (`memory.service.ts`)
**Purpose**: Manages conversation history and agent working memory.

**Key Features**:
- Long-term conversation storage (MongoDB)
- Short-term working memory (Redis + MongoDB)
- Automatic conversation summarization
- Title generation
- Context retrieval
- Memory expiration and cleanup

**Main Methods**:
- `createConversation()` - Start new conversation
- `addMessage()` - Add message to history
- `getConversation()` - Retrieve conversation
- `listConversations()` - Query conversations
- `updateConversationSummary()` - Generate summary
- `getWorkingMemory()` - Get agent working memory
- `updateWorkingMemory()` - Update agent state
- `addObservation()` - Track agent observations
- `addReasoning()` - Track reasoning steps
- `addToolCall()` - Track tool usage
- `addReflection()` - Track agent reflections

**Memory Types**:
- **Long-term**: Full conversation history in MongoDB
- **Short-term**: Active agent state in Redis (1-hour TTL) + MongoDB backup

## Architecture Patterns

### Encryption
All PHI fields are encrypted at rest using AES-256-GCM:
- `extractedText` - Document text content
- `fhirResource` - FHIR resource JSON
- `structuredData` - Parsed structured data

### Caching Strategy
- **Embeddings**: Redis cache with 7-day TTL
- **Working Memory**: Redis cache with 1-hour TTL + MongoDB persistence
- **Search Results**: No caching (real-time)

### Error Handling
All services implement:
- Try-catch blocks for external API calls
- Graceful degradation (e.g., search falls back to keyword if semantic fails)
- Detailed error logging
- User-friendly error messages

### Data Flow
```
User Input → API Layer → Service Layer → Data Layer (MongoDB/OpenSearch/Redis)
                                      ↓
                                  External APIs (OpenAI)
```

## Dependencies

### Required Packages
- `mongodb` - Database operations
- `@opensearch-project/opensearch` - Search operations
- `ioredis` - Redis caching
- `@langchain/openai` - OpenAI integration
- `@langchain/core` - LangChain utilities
- `zod` - Schema validation

### Environment Variables
- `MONGODB_URL` - MongoDB connection string
- `OPENSEARCH_URL` - OpenSearch endpoint
- `REDIS_HOST` - Redis host
- `OPENAI_API_KEY` - OpenAI API key
- `ENCRYPTION_KEY` - AES-256 encryption key

## Usage Example

```typescript
import { Db } from 'mongodb';
import { Client } from '@opensearch-project/opensearch';
import Redis from 'ioredis';
import {
  DocumentService,
  SearchService,
  FHIRService,
  EmbeddingService,
  EntityExtractionService,
  GraphService,
  MemoryService,
} from './service/index.js';

// Initialize services
const documentService = new DocumentService(db);
const searchService = new SearchService(opensearchClient, db);
const fhirService = new FHIRService();
const embeddingService = new EmbeddingService(openaiApiKey, redis);
const entityService = new EntityExtractionService(openaiApiKey);
const graphService = new GraphService(db, openaiApiKey);
const memoryService = new MemoryService(db, redis, openaiApiKey);

// Create and index a document
const doc = await documentService.createDocument({
  patientId: 'patient-123',
  documentType: 'text',
  extractedText: 'Patient has diabetes and takes metformin.',
  uploadMethod: 'naturalLanguage',
  userId: 'user-456',
});

// Generate embedding and index
const embedding = await embeddingService.generateEmbedding(doc.extractedText);
await searchService.indexDocument(doc, embedding);

// Extract entities
const entities = await entityService.extractEntities(doc.extractedText);

// Search documents
const results = await searchService.hybridSearch(
  'diabetes medication',
  embedding,
  { patientId: 'patient-123' }
);

// Build patient graph
const graph = await graphService.buildPatientGraph('patient-123');

// Manage conversation
const conversation = await memoryService.createConversation(
  'user-456',
  'patient-123',
  'What medications am I taking?'
);
```

## Testing

Each service should be tested with:
1. Unit tests for core logic
2. Integration tests with real databases (use test containers)
3. Mock external APIs (OpenAI) for deterministic tests

## Next Steps

The service layer is now complete. Next tasks:
1. Implement LangChain tool system (Task 4)
2. Build specialized agents (Task 5)
3. Implement supervisor agent (Task 6)
4. Create API endpoints (Task 8)

## HIPAA Compliance

All services implement HIPAA-compliant features:
- ✅ Encryption at rest (AES-256)
- ✅ Audit logging for all operations
- ✅ Data isolation by patient ID
- ✅ Secure key management
- ✅ Access tracking
