import { Document } from './document.model.js';

export interface SearchResult {
  documentId: string;
  patientId: string;
  score: number;
  highlights: string[];
  document: Partial<Document>;
  metadata: SearchMetadata;
}

export interface SearchMetadata {
  searchMethod: 'keyword' | 'semantic' | 'hybrid';
  matchedFields: string[];
  relevanceScore?: number;
  vectorScore?: number;
  keywordScore?: number;
}

export interface SearchQuery {
  text: string;
  patientId?: string;
  documentType?: string;
  dateRange?: DateRange;
  limit: number;
  offset?: number;
  filters?: Record<string, any>;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface SearchResults {
  results: SearchResult[];
  total: number;
  page?: number;
  hasMore?: boolean;
  aggregations?: Record<string, any>;
}

export interface HybridSearchQuery {
  textQuery: string;
  vectorQuery?: number[];
  filters?: Record<string, any>;
  limit: number;
  offset?: number;
  boost?: {
    keyword?: number;
    semantic?: number;
  };
}
