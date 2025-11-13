import { Db, Collection } from 'mongodb';
import Redis from 'ioredis';
import { ChatOpenAI } from '@langchain/openai';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: any;
  toolCalls?: ToolCall[];
  reasoning?: string;
}

export interface ToolCall {
  toolName: string;
  parameters: any;
  result?: any;
  evaluation?: string;
  timestamp: Date;
}

export interface Conversation {
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

export interface WorkingMemory {
  conversationId: string;
  agentType: 'supervisor' | 'upload' | 'query' | 'edit' | 'delete' | 'visualization';
  currentTask: string;
  taskState: 'planning' | 'executing' | 'evaluating' | 'completed' | 'failed';
  observations: Observation[];
  reasoning: ReasoningStep[];
  toolCallHistory: ToolCall[];
  reflections: Reflection[];
  createdAt: Date;
  expiresAt: Date;
}

export interface Observation {
  timestamp: Date;
  observation: string;
  source: string;
}

export interface ReasoningStep {
  timestamp: Date;
  thought: string;
  decision: string;
}

export interface Reflection {
  timestamp: Date;
  reflection: string;
  correctionNeeded: boolean;
  correctionPlan?: string;
}

export interface ConversationFilters {
  archived?: boolean;
  patientId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Memory Service - Manages conversation history and working memory
 * Implements both long-term (MongoDB) and short-term (Redis + MongoDB) memory
 */
export class MemoryService {
  private db: Db;
  private redis: Redis;
  private conversationsCollection: Collection<Conversation>;
  private workingMemoryCollection: Collection<WorkingMemory>;
  private llm: ChatOpenAI;
  private readonly WORKING_MEMORY_TTL = 3600; // 1 hour in seconds
  private readonly REDIS_PREFIX = 'working_memory:';

  constructor(db: Db, redis: Redis, openaiApiKey: string) {
    this.db = db;
    this.redis = redis;
    this.conversationsCollection = db.collection<Conversation>('conversations');
    this.workingMemoryCollection = db.collection<WorkingMemory>('agent_memory');
    this.llm = new ChatOpenAI({
      openAIApiKey: openaiApiKey,
      modelName: 'gpt-4',
      temperature: 0.3,
    });
  }

  // ==================== Long-Term Memory (Conversations) ====================

  /**
   * Create a new conversation
   */
  async createConversation(
    userId: string,
    patientId?: string,
    initialMessage?: string
  ): Promise<Conversation> {
    const conversationId = this.generateConversationId();
    const now = new Date();

    const conversation: Conversation = {
      conversationId,
      userId,
      patientId,
      title: 'New Conversation',
      messages: initialMessage
        ? [
            {
              role: 'user',
              content: initialMessage,
              timestamp: now,
            },
          ]
        : [],
      context: {},
      summary: '',
      createdAt: now,
      lastActivity: now,
      archived: false,
    };

    await this.conversationsCollection.insertOne(conversation);

    // Generate title from first message
    if (initialMessage) {
      const title = await this.generateConversationTitle(initialMessage);
      await this.updateConversation(conversationId, { title });
      conversation.title = title;
    }

    return conversation;
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    return await this.conversationsCollection.findOne({ conversationId });
  }

  /**
   * List conversations for a user
   */
  async listConversations(
    userId: string,
    filters: ConversationFilters = {}
  ): Promise<Conversation[]> {
    const query: any = { userId };

    if (filters.archived !== undefined) {
      query.archived = filters.archived;
    }

    if (filters.patientId) {
      query.patientId = filters.patientId;
    }

    if (filters.startDate || filters.endDate) {
      query.lastActivity = {};
      if (filters.startDate) {
        query.lastActivity.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.lastActivity.$lte = filters.endDate;
      }
    }

    return await this.conversationsCollection
      .find(query)
      .sort({ lastActivity: -1 })
      .skip(filters.offset || 0)
      .limit(filters.limit || 50)
      .toArray();
  }

  /**
   * Add message to conversation
   */
  async addMessage(conversationId: string, message: Message): Promise<void> {
    await this.conversationsCollection.updateOne(
      { conversationId },
      {
        $push: { messages: message },
        $set: { lastActivity: new Date() },
      }
    );
  }

  /**
   * Update conversation metadata
   */
  async updateConversation(
    conversationId: string,
    updates: Partial<Conversation>
  ): Promise<void> {
    await this.conversationsCollection.updateOne(
      { conversationId },
      { $set: updates }
    );
  }

  /**
   * Archive conversation
   */
  async archiveConversation(conversationId: string): Promise<void> {
    await this.conversationsCollection.updateOne(
      { conversationId },
      { $set: { archived: true } }
    );
  }

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    await this.conversationsCollection.deleteOne({ conversationId });
    await this.clearWorkingMemory(conversationId);
  }

  /**
   * Generate conversation summary
   */
  async updateConversationSummary(conversationId: string): Promise<string> {
    const conversation = await this.getConversation(conversationId);

    if (!conversation || conversation.messages.length === 0) {
      return '';
    }

    // Get last 10 messages for summary
    const recentMessages = conversation.messages.slice(-10);
    const messageText = recentMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `Summarize the following conversation in 2-3 sentences. Focus on the main topics and key information discussed.

Conversation:
${messageText}

Summary:`;

    try {
      const response = await this.llm.invoke(prompt);
      const summary = response.content.toString();

      await this.updateConversation(conversationId, { summary });

      return summary;
    } catch (error) {
      console.error('Error generating summary:', error);
      return '';
    }
  }

  /**
   * Generate conversation title from first message
   */
  private async generateConversationTitle(firstMessage: string): Promise<string> {
    const prompt = `Generate a short, descriptive title (max 6 words) for a conversation that starts with:

"${firstMessage.substring(0, 200)}"

Title:`;

    try {
      const response = await this.llm.invoke(prompt);
      return response.content.toString().trim().replace(/^["']|["']$/g, '');
    } catch (error) {
      console.error('Error generating title:', error);
      return 'New Conversation';
    }
  }

  // ==================== Short-Term Memory (Working Memory) ====================

  /**
   * Get working memory (from Redis or MongoDB)
   */
  async getWorkingMemory(conversationId: string): Promise<WorkingMemory | null> {
    // Try Redis first (hot cache)
    const redisKey = this.getRedisKey(conversationId);
    const cached = await this.redis.get(redisKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Fall back to MongoDB (warm storage)
    const memory = await this.workingMemoryCollection.findOne({ conversationId });

    if (memory) {
      // Refresh Redis cache
      await this.redis.setex(redisKey, this.WORKING_MEMORY_TTL, JSON.stringify(memory));
    }

    return memory;
  }

  /**
   * Create or update working memory
   */
  async updateWorkingMemory(
    conversationId: string,
    update: Partial<WorkingMemory>
  ): Promise<void> {
    const existing = await this.getWorkingMemory(conversationId);
    const now = new Date();

    if (existing) {
      // Update existing memory
      const updated = { ...existing, ...update };
      await this.workingMemoryCollection.updateOne(
        { conversationId },
        { $set: updated }
      );

      // Update Redis cache
      const redisKey = this.getRedisKey(conversationId);
      await this.redis.setex(redisKey, this.WORKING_MEMORY_TTL, JSON.stringify(updated));
    } else {
      // Create new working memory
      const memory: WorkingMemory = {
        conversationId,
        agentType: update.agentType || 'supervisor',
        currentTask: update.currentTask || '',
        taskState: update.taskState || 'planning',
        observations: update.observations || [],
        reasoning: update.reasoning || [],
        toolCallHistory: update.toolCallHistory || [],
        reflections: update.reflections || [],
        createdAt: now,
        expiresAt: new Date(now.getTime() + this.WORKING_MEMORY_TTL * 1000),
      };

      await this.workingMemoryCollection.insertOne(memory);

      // Cache in Redis
      const redisKey = this.getRedisKey(conversationId);
      await this.redis.setex(
        redisKey,
        this.WORKING_MEMORY_TTL,
        JSON.stringify(memory)
      );
    }
  }

  /**
   * Add observation to working memory
   */
  async addObservation(
    conversationId: string,
    observation: string,
    source: string
  ): Promise<void> {
    const memory = await this.getWorkingMemory(conversationId);

    if (!memory) {
      await this.updateWorkingMemory(conversationId, {
        observations: [{ timestamp: new Date(), observation, source }],
      });
      return;
    }

    memory.observations.push({ timestamp: new Date(), observation, source });
    await this.updateWorkingMemory(conversationId, { observations: memory.observations });
  }

  /**
   * Add reasoning step to working memory
   */
  async addReasoning(
    conversationId: string,
    thought: string,
    decision: string
  ): Promise<void> {
    const memory = await this.getWorkingMemory(conversationId);

    if (!memory) {
      await this.updateWorkingMemory(conversationId, {
        reasoning: [{ timestamp: new Date(), thought, decision }],
      });
      return;
    }

    memory.reasoning.push({ timestamp: new Date(), thought, decision });
    await this.updateWorkingMemory(conversationId, { reasoning: memory.reasoning });
  }

  /**
   * Add tool call to working memory
   */
  async addToolCall(conversationId: string, toolCall: ToolCall): Promise<void> {
    const memory = await this.getWorkingMemory(conversationId);

    if (!memory) {
      await this.updateWorkingMemory(conversationId, {
        toolCallHistory: [toolCall],
      });
      return;
    }

    memory.toolCallHistory.push(toolCall);
    await this.updateWorkingMemory(conversationId, {
      toolCallHistory: memory.toolCallHistory,
    });
  }

  /**
   * Add reflection to working memory
   */
  async addReflection(
    conversationId: string,
    reflection: string,
    correctionNeeded: boolean,
    correctionPlan?: string
  ): Promise<void> {
    const memory = await this.getWorkingMemory(conversationId);

    if (!memory) {
      await this.updateWorkingMemory(conversationId, {
        reflections: [
          {
            timestamp: new Date(),
            reflection,
            correctionNeeded,
            correctionPlan,
          },
        ],
      });
      return;
    }

    memory.reflections.push({
      timestamp: new Date(),
      reflection,
      correctionNeeded,
      correctionPlan,
    });
    await this.updateWorkingMemory(conversationId, {
      reflections: memory.reflections,
    });
  }

  /**
   * Clear working memory
   */
  async clearWorkingMemory(conversationId: string): Promise<void> {
    // Remove from Redis
    const redisKey = this.getRedisKey(conversationId);
    await this.redis.del(redisKey);

    // Remove from MongoDB
    await this.workingMemoryCollection.deleteOne({ conversationId });
  }

  /**
   * Get conversation context (recent messages + working memory)
   */
  async getConversationContext(conversationId: string): Promise<{
    recentMessages: Message[];
    workingMemory: WorkingMemory | null;
    summary: string;
  }> {
    const conversation = await this.getConversation(conversationId);
    const workingMemory = await this.getWorkingMemory(conversationId);

    if (!conversation) {
      return {
        recentMessages: [],
        workingMemory: null,
        summary: '',
      };
    }

    // Get last 10 messages
    const recentMessages = conversation.messages.slice(-10);

    return {
      recentMessages,
      workingMemory,
      summary: conversation.summary,
    };
  }

  /**
   * Clean up expired working memory
   */
  async cleanupExpiredMemory(): Promise<number> {
    const now = new Date();
    const result = await this.workingMemoryCollection.deleteMany({
      expiresAt: { $lt: now },
    });

    return result.deletedCount;
  }

  /**
   * Get Redis key for working memory
   */
  private getRedisKey(conversationId: string): string {
    return `${this.REDIS_PREFIX}${conversationId}`;
  }

  /**
   * Generate unique conversation ID
   */
  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}
