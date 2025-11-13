/**
 * Supervisor Agent
 * Orchestrates specialized sub-agents and manages conversation flow
 * 
 * Responsibilities:
 * - Receive user natural language input
 * - Classify intent (upload, query, edit, delete, visualize)
 * - Route requests to appropriate sub-agents
 * - Maintain conversation context across interactions
 * - Coordinate multi-step workflows
 * - Synthesize responses from sub-agents
 * - Perform reasoning and self-reflection on agent actions
 * - Make tool calls and evaluate results
 * - Manage short-term and long-term memory
 */

import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { MemoryService } from '../service/memory.service.js';
import { UploadAgent } from './upload.agent.js';
import { QueryAgent } from './query.agent.js';
import { EditAgent } from './edit.agent.js';
import { DeleteAgent } from './delete.agent.js';
import { VisualizationAgent } from './visualization.agent.js';

/**
 * Intent types
 */
export type Intent =
  | 'upload'
  | 'query'
  | 'edit'
  | 'delete'
  | 'visualize'
  | 'general'
  | 'clarification';

/**
 * Supervisor Agent Configuration
 */
export interface SupervisorAgentConfig {
  memoryService: MemoryService;
  uploadAgent: UploadAgent;
  queryAgent: QueryAgent;
  editAgent: EditAgent;
  deleteAgent: DeleteAgent;
  visualizationAgent: VisualizationAgent;
  openaiApiKey: string;
  model?: string;
  temperature?: number;
}

/**
 * Agent Response
 */
export interface AgentResponse {
  success: boolean;
  message: string;
  action?: string;
  data?: any;
  requiresFollowUp: boolean;
  reasoning?: string;
  toolCalls?: Array<{
    toolName: string;
    parameters: any;
    result?: any;
  }>;
  intent?: Intent;
  subAgentUsed?: string;
  conversationId: string;
}

/**
 * Conversation Context
 */
export interface ConversationContext {
  conversationId: string;
  userId: string;
  patientId?: string;
  recentMessages: any[];
  workingMemory: any;
  summary: string;
}

/**
 * Reasoning Result
 */
export interface ReasoningResult {
  thought: string;
  nextAction: string;
  confidence: number;
  intent: Intent;
}

/**
 * Reflection Result
 */
export interface ReflectionResult {
  wasSuccessful: boolean;
  lessonsLearned: string[];
  correctionNeeded: boolean;
  correctionPlan?: string;
}

/**
 * Supervisor Agent
 */
export class SupervisorAgent {
  private llm: ChatOpenAI;
  private memoryService: MemoryService;
  private uploadAgent: UploadAgent;
  private queryAgent: QueryAgent;
  private editAgent: EditAgent;
  private deleteAgent: DeleteAgent;
  private visualizationAgent: VisualizationAgent;

  constructor(config: SupervisorAgentConfig) {
    this.memoryService = config.memoryService;
    this.uploadAgent = config.uploadAgent;
    this.queryAgent = config.queryAgent;
    this.editAgent = config.editAgent;
    this.deleteAgent = config.deleteAgent;
    this.visualizationAgent = config.visualizationAgent;

    // Initialize LLM
    this.llm = new ChatOpenAI({
      modelName: config.model || 'gpt-4',
      temperature: config.temperature || 0.2,
      openAIApiKey: config.openaiApiKey,
    });
  }

  /**
   * System prompt for supervisor agent
   */
  private getSystemPrompt(): string {
    return `You are a Supervisor Agent for an Intelligent Medical Assistant system.

Your role is to:
1. Understand user requests about medical documents and information
2. Classify the intent of each request
3. Route requests to the appropriate specialized agent
4. Maintain conversation context and continuity
5. Synthesize responses from sub-agents into coherent answers
6. Coordinate multi-step workflows when needed
7. Request clarification when user intent is unclear

Available Sub-Agents:
- Upload Agent: Handles document uploads (FHIR, PDF, text, markdown)
- Query Agent: Answers questions about medical documents using search
- Edit Agent: Modifies existing documents
- Delete Agent: Removes documents
- Visualization Agent: Creates graph visualizations of medical relationships

Intent Classification Guidelines:
- "upload" - User wants to add/store a document or medical information
- "query" - User is asking a question or searching for information
- "edit" - User wants to modify/update existing information
- "delete" - User wants to remove a document or information
- "visualize" - User wants to see a graph or visual representation
- "general" - General conversation, greetings, or system questions
- "clarification" - User is responding to a clarification request

Guidelines:
- Always maintain context from previous messages in the conversation
- If intent is unclear, ask for clarification before routing
- Provide clear, helpful responses that synthesize sub-agent results
- Track conversation state and working memory
- Be professional, accurate, and patient-focused
- Explain your reasoning when helpful for transparency

Remember: You are coordinating a medical system. Accuracy and patient safety are paramount.`;
  }

  /**
   * Create supervisor-specific tools
   */
  private createTools() {
    const classifyIntentTool = tool(
      async ({ userInput, conversationContext }) => {
        try {
          const prompt = `Classify the intent of this user input in a medical assistant conversation.

User Input: "${userInput}"

Conversation Context: ${conversationContext || 'None'}

Classify as one of:
- upload: User wants to add/store medical documents or information
- query: User is asking questions or searching for information
- edit: User wants to modify existing documents
- delete: User wants to remove documents
- visualize: User wants to see graphs or visual representations
- general: General conversation, greetings, system questions
- clarification: User is responding to a previous clarification request

Respond with just the intent classification and a brief reason (max 20 words).
Format: intent|reason`;

          const response = await this.llm.invoke([new HumanMessage(prompt)]);
          const content = (response.content as string).trim();
          const [intent, reason] = content.split('|');

          return JSON.stringify({
            success: true,
            intent: intent.trim().toLowerCase(),
            reason: reason?.trim() || '',
            confidence: 0.8,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'classify_intent',
        description: 'Classify the intent of user input to determine which sub-agent should handle it.',
        schema: z.object({
          userInput: z.string().describe('The user input to classify'),
          conversationContext: z.string().optional().describe('Recent conversation context'),
        }),
      }
    );

    const getConversationContextTool = tool(
      async ({ conversationId }) => {
        try {
          const context = await this.memoryService.getConversationContext(conversationId);

          return JSON.stringify({
            success: true,
            context: {
              recentMessages: context.recentMessages.slice(-5).map((m) => ({
                role: m.role,
                content: m.content.substring(0, 200),
                timestamp: m.timestamp,
              })),
              summary: context.summary,
              hasWorkingMemory: !!context.workingMemory,
            },
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'get_conversation_context',
        description: 'Retrieve recent conversation history and context for continuity.',
        schema: z.object({
          conversationId: z.string().describe('The conversation ID'),
        }),
      }
    );

    const requestClarificationTool = tool(
      async ({ question, reason }) => {
        return JSON.stringify({
          success: true,
          clarificationNeeded: true,
          question,
          reason,
        });
      },
      {
        name: 'request_clarification',
        description: 'Request clarification from the user when intent or requirements are unclear.',
        schema: z.object({
          question: z.string().describe('The clarification question to ask'),
          reason: z.string().describe('Why clarification is needed'),
        }),
      }
    );

    return [classifyIntentTool, getConversationContextTool, requestClarificationTool];
  }

  /**
   * Process user input
   */
  async processUserInput(
    input: string,
    conversationId: string,
    userId: string,
    patientId?: string
  ): Promise<AgentResponse> {
    try {
      // Get or create conversation
      let conversation = await this.memoryService.getConversation(conversationId);
      if (!conversation) {
        conversation = await this.memoryService.createConversation(
          userId,
          patientId,
          input
        );
      } else {
        // Add user message to conversation
        await this.memoryService.addMessage(conversationId, {
          role: 'user',
          content: input,
          timestamp: new Date(),
        });
      }

      // Get conversation context
      const context = await this.maintainContext(conversationId);

      // Classify intent and route to appropriate sub-agent
      const reasoning = await this.reason(input, context);
      
      // Track reasoning in working memory
      await this.memoryService.addReasoning(
        conversationId,
        reasoning.thought,
        reasoning.nextAction
      );

      // Route to sub-agent based on intent
      const subAgentResult = await this.routeToSubAgent(
        reasoning.intent,
        input,
        context,
        userId,
        patientId
      );

      // Reflect on the result
      const reflection = await this.reflect(
        [{ action: reasoning.nextAction, outcome: subAgentResult }],
        subAgentResult
      );

      // Track reflection in working memory
      await this.memoryService.addReflection(
        conversationId,
        reflection.lessonsLearned.join('; '),
        reflection.correctionNeeded,
        reflection.correctionPlan
      );

      // Synthesize final response
      const finalMessage = await this.synthesizeResponse(
        input,
        reasoning.intent,
        subAgentResult,
        reflection
      );

      // Add assistant message to conversation
      await this.memoryService.addMessage(conversationId, {
        role: 'assistant',
        content: finalMessage,
        timestamp: new Date(),
        reasoning: reasoning.thought,
      });

      // Update conversation summary periodically (every 10 messages)
      if (conversation.messages.length % 10 === 0) {
        await this.memoryService.updateConversationSummary(conversationId);
      }

      return {
        success: subAgentResult.success,
        message: finalMessage,
        action: reasoning.nextAction,
        data: subAgentResult.data,
        requiresFollowUp: subAgentResult.requiresFollowUp || reflection.correctionNeeded,
        reasoning: reasoning.thought,
        intent: reasoning.intent,
        subAgentUsed: this.getSubAgentName(reasoning.intent),
        conversationId,
      };
    } catch (error: any) {
      // Add error to conversation
      await this.memoryService.addMessage(conversationId, {
        role: 'assistant',
        content: `I encountered an error: ${error.message}. Please try again or rephrase your request.`,
        timestamp: new Date(),
      });

      return {
        success: false,
        message: `I encountered an error processing your request: ${error.message}`,
        requiresFollowUp: true,
        conversationId,
      };
    }
  }

  /**
   * Classify intent and reason about next action
   */
  private async reason(
    input: string,
    context: ConversationContext
  ): Promise<ReasoningResult> {
    const tools = this.createTools();
    const llmWithTools = this.llm.bindTools(tools);

    // Build context summary
    const contextSummary = context.recentMessages
      .slice(-3)
      .map((m) => `${m.role}: ${m.content.substring(0, 100)}`)
      .join('\n');

    const messages = [
      new SystemMessage(this.getSystemPrompt()),
      new HumanMessage(
        `Analyze this user input and determine the intent and next action.

User Input: "${input}"

Recent Context:
${contextSummary || 'No recent context'}

Conversation Summary: ${context.summary || 'New conversation'}

Please:
1. Classify the intent (upload, query, edit, delete, visualize, general, clarification)
2. Determine the next action to take
3. Assess your confidence (0-1)

Provide your analysis.`
      ),
    ];

    const response = await llmWithTools.invoke(messages);
    const content = (response.content as string).toLowerCase();

    // Extract intent from response
    let intent: Intent = 'general';
    if (content.includes('upload')) intent = 'upload';
    else if (content.includes('query') || content.includes('search') || content.includes('find') || content.includes('question')) intent = 'query';
    else if (content.includes('edit') || content.includes('update') || content.includes('modify')) intent = 'edit';
    else if (content.includes('delete') || content.includes('remove')) intent = 'delete';
    else if (content.includes('visualize') || content.includes('graph') || content.includes('show')) intent = 'visualize';
    else if (content.includes('clarif')) intent = 'clarification';

    // Determine next action
    let nextAction = `Route to ${intent} agent`;
    if (intent === 'general') {
      nextAction = 'Provide general response';
    } else if (intent === 'clarification') {
      nextAction = 'Request clarification';
    }

    return {
      thought: response.content as string,
      nextAction,
      confidence: 0.8,
      intent,
    };
  }

  /**
   * Route to appropriate sub-agent
   */
  private async routeToSubAgent(
    intent: Intent,
    input: string,
    context: ConversationContext,
    userId: string,
    patientId?: string
  ): Promise<any> {
    const conversationId = context.conversationId;

    // Update working memory with current task
    await this.memoryService.updateWorkingMemory(conversationId, {
      agentType: intent === 'general' ? 'supervisor' : intent,
      currentTask: input,
      taskState: 'executing',
    });

    try {
      let result: any;

      switch (intent) {
        case 'upload':
          if (!patientId) {
            return {
              success: false,
              message: 'Patient ID is required for document upload. Please provide the patient ID.',
              requiresFollowUp: true,
            };
          }
          result = await this.uploadAgent.processNaturalLanguageUpload(
            input,
            patientId,
            userId
          );
          break;

        case 'query':
          if (!patientId) {
            return {
              success: false,
              message: 'Patient ID is required for queries. Please provide the patient ID.',
              requiresFollowUp: true,
            };
          }
          result = await this.queryAgent.processQuery(input, patientId, userId);
          break;

        case 'edit':
          if (!patientId) {
            return {
              success: false,
              message: 'Patient ID is required for editing documents. Please provide the patient ID.',
              requiresFollowUp: true,
            };
          }
          result = await this.editAgent.processNaturalLanguageEdit(
            input,
            patientId,
            userId
          );
          break;

        case 'delete':
          if (!patientId) {
            return {
              success: false,
              message: 'Patient ID is required for deleting documents. Please provide the patient ID.',
              requiresFollowUp: true,
            };
          }
          result = await this.deleteAgent.processNaturalLanguageDelete(
            input,
            patientId,
            userId
          );
          break;

        case 'visualize':
          if (!patientId) {
            return {
              success: false,
              message: 'Patient ID is required for visualizations. Please provide the patient ID.',
              requiresFollowUp: true,
            };
          }
          result = await this.visualizationAgent.generateGraph(input, patientId, userId);
          break;

        case 'general':
          result = await this.handleGeneralConversation(input, context);
          break;

        case 'clarification':
          result = {
            success: true,
            message: 'Thank you for the clarification. How can I help you with your medical documents?',
            requiresFollowUp: false,
          };
          break;

        default:
          result = {
            success: false,
            message: 'I could not determine how to help with that request. Could you please rephrase?',
            requiresFollowUp: true,
          };
      }

      // Update working memory with result
      await this.memoryService.updateWorkingMemory(conversationId, {
        taskState: result.success ? 'completed' : 'failed',
      });

      return result;
    } catch (error: any) {
      await this.memoryService.updateWorkingMemory(conversationId, {
        taskState: 'failed',
      });

      return {
        success: false,
        message: `Error routing to ${intent} agent: ${error.message}`,
        requiresFollowUp: true,
      };
    }
  }

  /**
   * Handle general conversation
   */
  private async handleGeneralConversation(
    input: string,
    context: ConversationContext
  ): Promise<any> {
    const prompt = `You are a helpful medical assistant. Respond to this general query:

User: ${input}

Provide a brief, helpful response. If the user is asking about system capabilities, explain what you can do (upload documents, answer questions, edit/delete documents, create visualizations).`;

    const response = await this.llm.invoke([new HumanMessage(prompt)]);

    return {
      success: true,
      message: response.content as string,
      requiresFollowUp: false,
    };
  }

  /**
   * Maintain conversation context
   */
  async maintainContext(conversationId: string): Promise<ConversationContext> {
    const context = await this.memoryService.getConversationContext(conversationId);
    const conversation = await this.memoryService.getConversation(conversationId);

    return {
      conversationId,
      userId: conversation?.userId || '',
      patientId: conversation?.patientId,
      recentMessages: context.recentMessages,
      workingMemory: context.workingMemory,
      summary: context.summary,
    };
  }

  /**
   * Reflect on action outcomes
   */
  async reflect(
    actionHistory: Array<{ action: string; outcome: any }>,
    finalOutcome: any
  ): Promise<ReflectionResult> {
    const wasSuccessful = finalOutcome.success === true;
    const lessonsLearned: string[] = [];
    let correctionNeeded = false;
    let correctionPlan: string | undefined;

    if (!wasSuccessful) {
      lessonsLearned.push('Action did not succeed');
      
      // Determine if correction is possible
      if (finalOutcome.message?.includes('Patient ID')) {
        correctionNeeded = true;
        correctionPlan = 'Request patient ID from user';
        lessonsLearned.push('Missing required patient ID');
      } else if (finalOutcome.requiresFollowUp) {
        correctionNeeded = true;
        correctionPlan = 'Request clarification or additional information';
        lessonsLearned.push('Additional information needed from user');
      } else if (finalOutcome.message?.includes('not found')) {
        lessonsLearned.push('Target resource not found');
        correctionNeeded = true;
        correctionPlan = 'Help user search for the correct resource';
      }
    } else {
      lessonsLearned.push('Action completed successfully');
      
      // Check if follow-up is needed
      if (finalOutcome.requiresFollowUp || finalOutcome.needsClarification) {
        correctionNeeded = true;
        correctionPlan = 'Provide follow-up assistance';
        lessonsLearned.push('User may need additional help');
      }
    }

    return {
      wasSuccessful,
      lessonsLearned,
      correctionNeeded,
      correctionPlan,
    };
  }

  /**
   * Synthesize response from sub-agent results
   */
  private async synthesizeResponse(
    userInput: string,
    intent: Intent,
    subAgentResult: any,
    reflection: ReflectionResult
  ): Promise<string> {
    // If sub-agent provided a clear message, use it
    if (subAgentResult.message) {
      // Add context if correction is needed
      if (reflection.correctionNeeded && reflection.correctionPlan) {
        return `${subAgentResult.message}\n\n${reflection.correctionPlan}`;
      }
      return subAgentResult.message;
    }

    // Synthesize a response based on intent and result
    if (subAgentResult.success) {
      switch (intent) {
        case 'upload':
          return `Document uploaded successfully. ${subAgentResult.documentId ? `Document ID: ${subAgentResult.documentId}` : ''}`;
        case 'query':
          return subAgentResult.answer || 'Query processed successfully.';
        case 'edit':
          return `Document updated successfully. ${subAgentResult.fieldsModified ? `Modified fields: ${subAgentResult.fieldsModified.join(', ')}` : ''}`;
        case 'delete':
          return 'Document deleted successfully.';
        case 'visualize':
          return 'Visualization generated successfully.';
        default:
          return 'Request processed successfully.';
      }
    } else {
      return subAgentResult.error || 'I encountered an issue processing your request. Please try again.';
    }
  }

  /**
   * Get sub-agent name from intent
   */
  private getSubAgentName(intent: Intent): string {
    switch (intent) {
      case 'upload':
        return 'UploadAgent';
      case 'query':
        return 'QueryAgent';
      case 'edit':
        return 'EditAgent';
      case 'delete':
        return 'DeleteAgent';
      case 'visualize':
        return 'VisualizationAgent';
      default:
        return 'SupervisorAgent';
    }
  }

  /**
   * Call tool and evaluate result
   */
  async callTool(toolName: string, params: any, conversationId: string): Promise<any> {
    const tools = this.createTools();
    const tool = tools.find((t) => t.name === toolName);

    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const result = await tool.invoke(params);
    
    // Track tool call in working memory
    await this.memoryService.addToolCall(conversationId, {
      toolName,
      parameters: params,
      result,
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Evaluate tool result
   */
  async evaluateToolResult(
    result: any,
    expectedOutcome: string,
    conversationId: string
  ): Promise<{ success: boolean; evaluation: string }> {
    try {
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      
      const prompt = `Evaluate if this tool result meets the expected outcome:

Expected: ${expectedOutcome}
Actual Result: ${resultStr}

Does the result meet expectations? Respond with "yes" or "no" and a brief explanation.`;

      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      const content = (response.content as string).toLowerCase();
      
      const success = content.includes('yes');
      const evaluation = response.content as string;

      // Track evaluation in working memory
      await this.memoryService.addObservation(
        conversationId,
        `Tool result evaluation: ${evaluation}`,
        'supervisor'
      );

      return { success, evaluation };
    } catch (error: any) {
      return {
        success: false,
        evaluation: `Evaluation failed: ${error.message}`,
      };
    }
  }
}
