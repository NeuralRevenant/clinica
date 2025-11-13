export interface AgentResponse {
  message: string;
  action?: string;
  data?: any;
  conversationId?: string;
  requiresFollowUp: boolean;
  reasoning?: string;
  toolCalls?: ToolCall[];
  confidence?: number;
  sources?: DocumentReference[];
}

export interface ToolCall {
  toolName: string;
  parameters: any;
  result?: any;
  evaluation?: string;
  timestamp?: Date;
}

export interface DocumentReference {
  documentId: string;
  title?: string;
  excerpt?: string;
  relevanceScore?: number;
  timestamp?: Date;
}

export interface ReasoningResult {
  thought: string;
  nextAction: string;
  confidence: number;
  alternatives?: string[];
}

export interface ReflectionResult {
  wasSuccessful: boolean;
  lessonsLearned: string[];
  correctionNeeded: boolean;
  correctionPlan?: string;
}

export interface SubAgentResult {
  agentType: 'upload' | 'query' | 'edit' | 'delete' | 'visualization';
  status: 'success' | 'error' | 'needs_clarification';
  message: string;
  data?: any;
  reasoning?: string;
  toolCalls?: ToolCall[];
}

export interface ConversationContext {
  conversationId: string;
  userId: string;
  patientId?: string;
  currentIntent?: Intent;
  history: Message[];
  workingMemory?: Record<string, any>;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: any;
}

export enum Intent {
  UPLOAD = 'upload',
  QUERY = 'query',
  EDIT = 'edit',
  DELETE = 'delete',
  VISUALIZE = 'visualize',
  UNKNOWN = 'unknown',
}

export interface AgentContext {
  conversationId: string;
  userId: string;
  patientId?: string;
  currentTask?: string;
  previousActions?: string[];
  availableTools?: string[];
}

export interface Evaluation {
  success: boolean;
  score: number;
  feedback: string;
  suggestions?: string[];
}

export interface CorrectionPlan {
  issue: string;
  proposedAction: string;
  alternativeApproaches?: string[];
  requiresUserInput: boolean;
}
