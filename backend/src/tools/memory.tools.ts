/**
 * Memory Operation Tools for LangChain Agents
 * Provides tools for managing conversation context and working memory
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryService } from '../service/memory.service.js';

/**
 * Create memory operation tools
 */
export function createMemoryTools(memoryService: MemoryService) {
  /**
   * Get Conversation Context Tool
   * Retrieves recent messages and working memory for a conversation
   */
  const getConversationContextTool = tool(
    async ({ conversationId }) => {
      try {
        const context = await memoryService.getConversationContext(conversationId);

        // Format recent messages
        const formattedMessages = context.recentMessages.map((msg) => ({
          role: msg.role,
          content: msg.content.substring(0, 200), // Truncate for brevity
          timestamp: msg.timestamp,
          hasToolCalls: !!msg.toolCalls && msg.toolCalls.length > 0,
          hasReasoning: !!msg.reasoning,
        }));

        // Format working memory
        const workingMemoryInfo = context.workingMemory
          ? {
              agentType: context.workingMemory.agentType,
              currentTask: context.workingMemory.currentTask,
              taskState: context.workingMemory.taskState,
              observationCount: context.workingMemory.observations.length,
              reasoningStepCount: context.workingMemory.reasoning.length,
              toolCallCount: context.workingMemory.toolCallHistory.length,
              reflectionCount: context.workingMemory.reflections.length,
              recentObservations: context.workingMemory.observations
                .slice(-3)
                .map((o) => ({
                  observation: o.observation,
                  source: o.source,
                  timestamp: o.timestamp,
                })),
              recentReasoning: context.workingMemory.reasoning
                .slice(-3)
                .map((r) => ({
                  thought: r.thought,
                  decision: r.decision,
                  timestamp: r.timestamp,
                })),
            }
          : null;

        return JSON.stringify({
          success: true,
          conversationId,
          messageCount: context.recentMessages.length,
          recentMessages: formattedMessages,
          summary: context.summary,
          workingMemory: workingMemoryInfo,
          message: `Retrieved context for conversation ${conversationId}`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to get conversation context: ${error.message}`,
        });
      }
    },
    {
      name: 'get_conversation_context',
      description: 'Retrieve conversation context including recent messages, summary, and working memory. Use this to understand the current state of a conversation and what has been discussed.',
      schema: z.object({
        conversationId: z.string().describe('The conversation ID to retrieve context for'),
      }),
    }
  );

  /**
   * Update Working Memory Tool
   * Updates the agent's working memory with new observations, reasoning, or reflections
   */
  const updateWorkingMemoryTool = tool(
    async ({
      conversationId,
      agentType,
      currentTask,
      taskState,
      observation,
      reasoning,
      reflection,
    }) => {
      try {
        const updates: any = {};

        if (agentType) updates.agentType = agentType;
        if (currentTask) updates.currentTask = currentTask;
        if (taskState) updates.taskState = taskState;

        // Update working memory
        await memoryService.updateWorkingMemory(conversationId, updates);

        // Add observation if provided
        if (observation) {
          await memoryService.addObservation(
            conversationId,
            observation.text,
            observation.source || 'agent'
          );
        }

        // Add reasoning if provided
        if (reasoning) {
          await memoryService.addReasoning(
            conversationId,
            reasoning.thought,
            reasoning.decision
          );
        }

        // Add reflection if provided
        if (reflection) {
          await memoryService.addReflection(
            conversationId,
            reflection.text,
            reflection.correctionNeeded || false,
            reflection.correctionPlan
          );
        }

        return JSON.stringify({
          success: true,
          conversationId,
          message: 'Working memory updated successfully',
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to update working memory: ${error.message}`,
        });
      }
    },
    {
      name: 'update_working_memory',
      description: 'Update the agent working memory with observations, reasoning steps, or reflections. Use this to track the agent thought process and maintain context during task execution.',
      schema: z.object({
        conversationId: z.string().describe('The conversation ID'),
        agentType: z
          .enum(['supervisor', 'upload', 'query', 'edit', 'delete', 'visualization'])
          .optional()
          .describe('The type of agent'),
        currentTask: z.string().optional().describe('Description of current task'),
        taskState: z
          .enum(['planning', 'executing', 'evaluating', 'completed', 'failed'])
          .optional()
          .describe('Current state of the task'),
        observation: z
          .object({
            text: z.string().describe('The observation text'),
            source: z.string().optional().describe('Source of observation'),
          })
          .optional()
          .describe('Add an observation'),
        reasoning: z
          .object({
            thought: z.string().describe('The reasoning thought'),
            decision: z.string().describe('The decision made'),
          })
          .optional()
          .describe('Add a reasoning step'),
        reflection: z
          .object({
            text: z.string().describe('The reflection text'),
            correctionNeeded: z.boolean().optional().describe('Whether correction is needed'),
            correctionPlan: z.string().optional().describe('Plan for correction'),
          })
          .optional()
          .describe('Add a reflection'),
      }),
    }
  );

  /**
   * Add Message Tool
   * Adds a message to the conversation history
   */
  const addMessageTool = tool(
    async ({ conversationId, role, content, metadata, toolCalls, reasoning }) => {
      try {
        const message = {
          role,
          content,
          timestamp: new Date(),
          metadata,
          toolCalls,
          reasoning,
        };

        await memoryService.addMessage(conversationId, message);

        return JSON.stringify({
          success: true,
          conversationId,
          message: 'Message added to conversation history',
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to add message: ${error.message}`,
        });
      }
    },
    {
      name: 'add_message',
      description: 'Add a message to the conversation history. Use this to record user inputs, agent responses, or system messages in the long-term conversation memory.',
      schema: z.object({
        conversationId: z.string().describe('The conversation ID'),
        role: z.enum(['user', 'assistant', 'system']).describe('Message role'),
        content: z.string().describe('Message content'),
        metadata: z.any().optional().describe('Additional metadata'),
        toolCalls: z.array(z.any()).optional().describe('Tool calls made'),
        reasoning: z.string().optional().describe('Agent reasoning'),
      }),
    }
  );

  /**
   * List Conversations Tool
   * Lists conversations for a user with filters
   */
  const listConversationsTool = tool(
    async ({ userId, patientId, archived, startDate, endDate, limit }) => {
      try {
        const filters: any = {
          patientId,
          archived,
          limit: limit || 50,
        };

        if (startDate) filters.startDate = new Date(startDate);
        if (endDate) filters.endDate = new Date(endDate);

        const conversations = await memoryService.listConversations(userId, filters);

        const formattedConversations = conversations.map((conv) => ({
          conversationId: conv.conversationId,
          title: conv.title,
          patientId: conv.patientId,
          messageCount: conv.messages.length,
          summary: conv.summary,
          createdAt: conv.createdAt,
          lastActivity: conv.lastActivity,
          archived: conv.archived,
        }));

        return JSON.stringify({
          success: true,
          total: conversations.length,
          conversations: formattedConversations,
          message: `Found ${conversations.length} conversations`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to list conversations: ${error.message}`,
        });
      }
    },
    {
      name: 'list_conversations',
      description: 'List conversations for a user with optional filters. Use this to find past conversations, check conversation history, or retrieve specific conversations by patient or date.',
      schema: z.object({
        userId: z.string().describe('The user ID'),
        patientId: z.string().optional().describe('Filter by patient ID'),
        archived: z.boolean().optional().describe('Filter by archived status'),
        startDate: z.string().optional().describe('Filter by start date (ISO format)'),
        endDate: z.string().optional().describe('Filter by end date (ISO format)'),
        limit: z.number().optional().describe('Maximum number of results (default: 50)'),
      }),
    }
  );

  /**
   * Generate Summary Tool
   * Generates or updates a conversation summary
   */
  const generateSummaryTool = tool(
    async ({ conversationId }) => {
      try {
        const summary = await memoryService.updateConversationSummary(conversationId);

        return JSON.stringify({
          success: true,
          conversationId,
          summary,
          message: 'Conversation summary generated successfully',
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to generate summary: ${error.message}`,
        });
      }
    },
    {
      name: 'generate_summary',
      description: 'Generate or update a conversation summary. Use this to create a concise summary of the conversation for quick reference or context retrieval.',
      schema: z.object({
        conversationId: z.string().describe('The conversation ID to summarize'),
      }),
    }
  );

  /**
   * Clear Working Memory Tool
   * Clears the working memory for a conversation
   */
  const clearWorkingMemoryTool = tool(
    async ({ conversationId }) => {
      try {
        await memoryService.clearWorkingMemory(conversationId);

        return JSON.stringify({
          success: true,
          conversationId,
          message: 'Working memory cleared successfully',
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to clear working memory: ${error.message}`,
        });
      }
    },
    {
      name: 'clear_working_memory',
      description: 'Clear the working memory for a conversation. Use this when starting a new task or when the current working memory is no longer relevant.',
      schema: z.object({
        conversationId: z.string().describe('The conversation ID'),
      }),
    }
  );

  return {
    getConversationContextTool,
    updateWorkingMemoryTool,
    addMessageTool,
    listConversationsTool,
    generateSummaryTool,
    clearWorkingMemoryTool,
  };
}
