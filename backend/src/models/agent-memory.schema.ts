import { ObjectId } from 'mongodb';

export interface Observation {
  timestamp: Date;
  observation: string;
  source: string;
}

export interface Reasoning {
  timestamp: Date;
  thought: string;
  decision: string;
}

export interface ToolCallHistory {
  toolName: string;
  parameters: any;
  result: any;
  evaluation: string;
  timestamp: Date;
}

export interface Reflection {
  timestamp: Date;
  reflection: string;
  correctionNeeded: boolean;
  correctionPlan?: string;
}

export interface WorkingMemory {
  currentTask: string;
  taskState: 'planning' | 'executing' | 'evaluating' | 'completed' | 'failed';
  observations: Observation[];
  reasoning: Reasoning[];
  toolCallHistory: ToolCallHistory[];
  reflections: Reflection[];
}

export interface AgentMemoryDocument {
  _id?: ObjectId;
  conversationId: string;
  agentType: 'supervisor' | 'upload' | 'query' | 'edit' | 'delete' | 'visualization';
  workingMemory: WorkingMemory;
  createdAt: Date;
  expiresAt: Date;
}

export const AGENT_MEMORY_COLLECTION = 'agent_memory';
