/**
 * Service Layer - Core business logic services
 * 
 * This module exports all service classes for the Intelligent Medical Assistant
 */

export { DocumentService } from './document.service.js';
export type {
  CreateDocumentDTO,
  UpdateDocumentDTO,
  DocumentFilters,
  MedicalDocument,
  AuditEntry,
  ValidationResult,
} from './document.service.js';

export { SearchService } from './search.service.js';
export type {
  SearchQuery,
  SearchResult,
  SearchResults,
} from './search.service.js';

export { FHIRService } from './fhir.service.js';
export type {
  ValidationResult as FHIRValidationResult,
  FHIRResource,
  FHIRBundle,
} from './fhir.service.js';

export { EmbeddingService } from './embedding.service.js';

export { EntityExtractionService } from './entity-extraction.service.js';
export type {
  EntityType,
  MedicalEntity,
  NormalizedEntity,
} from './entity-extraction.service.js';

export { GraphService } from './graph.service.js';
export type {
  GraphNode,
  GraphEdge,
  GraphData,
  GraphMetadata,
  Relationship,
  GraphQuery,
} from './graph.service.js';

export { MemoryService } from './memory.service.js';
export type {
  Message,
  ToolCall,
  Conversation,
  WorkingMemory,
  Observation,
  ReasoningStep,
  Reflection,
  ConversationFilters,
} from './memory.service.js';
