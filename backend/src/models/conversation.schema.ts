import { ObjectId } from 'mongodb';

export interface ToolCall {
  toolName: string;
  parameters: any;
  result?: any;
  evaluation?: string;
  timestamp: Date;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: any;
  toolCalls?: ToolCall[];
  reasoning?: string;
}

export interface ConversationDocument {
  _id?: ObjectId;
  conversationId: string;
  userId: string;
  patientId?: string;
  title: string;
  messages: Message[];
  context: Record<string, any>;
  summary: string;
  createdAt: Date;
  lastActivity: Date;
  archived: boolean;
  ttl?: Date;
}

export const CONVERSATION_COLLECTION = 'conversations';
