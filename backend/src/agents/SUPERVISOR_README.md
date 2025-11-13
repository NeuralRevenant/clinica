# Supervisor Agent

The Supervisor Agent is the central orchestrator for the Intelligent Medical Assistant system. It manages conversation flow, classifies user intent, routes requests to specialized sub-agents, and maintains conversation context.

## Overview

The Supervisor Agent implements a conversational AI interface that:
- Receives natural language input from users
- Classifies intent (upload, query, edit, delete, visualize, general)
- Routes requests to appropriate specialized agents
- Maintains conversation history and context
- Coordinates multi-step workflows
- Synthesizes responses from sub-agents
- Performs reasoning and self-reflection

## Architecture

```
User Input
    ↓
Supervisor Agent
    ↓
Intent Classification
    ↓
┌─────────────────────────────────────┐
│  Route to Sub-Agent:                │
│  - Upload Agent                     │
│  - Query Agent                      │
│  - Edit Agent                       │
│  - Delete Agent                     │
│  - Visualization Agent              │
└─────────────────────────────────────┘
    ↓
Response Synthesis
    ↓
User Response
```

## Key Features

### 1. Intent Classification

The supervisor automatically classifies user intent into categories:

- **upload**: User wants to add/store medical documents
- **query**: User is asking questions or searching for information
- **edit**: User wants to modify existing documents
- **delete**: User wants to remove documents
- **visualize**: User wants to see graphs or visual representations
- **general**: General conversation, greetings, system questions
- **clarification**: User is responding to a clarification request

### 2. Conversation Memory

The supervisor maintains two types of memory:

**Long-Term Memory (MongoDB)**:
- Full conversation history
- All messages with timestamps
- Conversation summaries
- User preferences

**Short-Term Working Memory (Redis + MongoDB)**:
- Current task state
- Observations and reasoning steps
- Tool call history
- Reflections and corrections

### 3. Reasoning and Reflection

The supervisor implements a reasoning loop:

1. **Observe**: Receive user input or sub-agent result
2. **Reason**: Analyze situation and determine next action
3. **Act**: Route to sub-agent or provide response
4. **Evaluate**: Assess outcome of action
5. **Reflect**: Determine if correction is needed
6. **Correct**: Adjust approach if necessary

### 4. Multi-Step Workflows

The supervisor can coordinate complex workflows:
- Request missing information (e.g., patient ID)
- Handle clarification requests
- Chain multiple sub-agent calls
- Maintain context across interactions

## Usage

### Basic Usage

```typescript
import { SupervisorAgent } from './agents/supervisor.agent.js';
import { MemoryService } from './service/memory.service.js';
// ... import other agents and services

// Initialize services
const memoryService = new MemoryService(db, redis, openaiApiKey);
const uploadAgent = new UploadAgent(uploadConfig);
const queryAgent = new QueryAgent(queryConfig);
// ... initialize other agents

// Create supervisor agent
const supervisor = new SupervisorAgent({
  memoryService,
  uploadAgent,
  queryAgent,
  editAgent,
  deleteAgent,
  visualizationAgent,
  openaiApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',
  temperature: 0.2,
});

// Process user input
const response = await supervisor.processUserInput(
  "What medications am I currently taking?",
  conversationId,
  userId,
  patientId
);

console.log(response.message);
// Output: "Based on your records, you are currently taking..."
```

### Conversation Flow Example

```typescript
// Start a new conversation
const response1 = await supervisor.processUserInput(
  "Hello, I need help with my medical records",
  "conv_123",
  "user_456"
);
// Intent: general
// Response: "Hello! I'm here to help you manage your medical documents..."

// Upload a document
const response2 = await supervisor.processUserInput(
  "I want to upload my recent lab results",
  "conv_123",
  "user_456",
  "patient_789"
);
// Intent: upload
// Routes to: UploadAgent
// Response: "I can help you upload your lab results..."

// Query information
const response3 = await supervisor.processUserInput(
  "What were my cholesterol levels?",
  "conv_123",
  "user_456",
  "patient_789"
);
// Intent: query
// Routes to: QueryAgent
// Response: "According to your lab results from [date], your cholesterol..."
```

### Handling Missing Information

```typescript
// User doesn't provide patient ID
const response = await supervisor.processUserInput(
  "Show me my medications",
  "conv_123",
  "user_456"
  // No patientId provided
);

// Supervisor detects missing information
console.log(response.message);
// Output: "Patient ID is required for queries. Please provide the patient ID."
console.log(response.requiresFollowUp); // true
```

### Multi-Step Workflow

```typescript
// Step 1: User asks ambiguous question
const response1 = await supervisor.processUserInput(
  "Update my medication",
  "conv_123",
  "user_456",
  "patient_789"
);
// Supervisor requests clarification
// Output: "Which medication would you like to update?"

// Step 2: User provides clarification
const response2 = await supervisor.processUserInput(
  "The blood pressure medication",
  "conv_123",
  "user_456",
  "patient_789"
);
// Supervisor maintains context and routes to EditAgent
// Output: "I found your blood pressure medication (Lisinopril 10mg)..."
```

## API Reference

### SupervisorAgent

#### Constructor

```typescript
constructor(config: SupervisorAgentConfig)
```

**Config Parameters:**
- `memoryService`: MemoryService instance
- `uploadAgent`: UploadAgent instance
- `queryAgent`: QueryAgent instance
- `editAgent`: EditAgent instance
- `deleteAgent`: DeleteAgent instance
- `visualizationAgent`: VisualizationAgent instance
- `openaiApiKey`: OpenAI API key
- `model`: LLM model name (default: 'gpt-4')
- `temperature`: LLM temperature (default: 0.2)

#### Methods

##### processUserInput

```typescript
async processUserInput(
  input: string,
  conversationId: string,
  userId: string,
  patientId?: string
): Promise<AgentResponse>
```

Main entry point for processing user input.

**Parameters:**
- `input`: User's natural language input
- `conversationId`: Unique conversation identifier
- `userId`: User identifier
- `patientId`: Optional patient identifier

**Returns:** `AgentResponse` object containing:
- `success`: Whether the request was successful
- `message`: Response message for the user
- `action`: Action taken by supervisor
- `data`: Additional data from sub-agent
- `requiresFollowUp`: Whether follow-up is needed
- `reasoning`: Supervisor's reasoning process
- `intent`: Classified intent
- `subAgentUsed`: Name of sub-agent used
- `conversationId`: Conversation identifier

##### maintainContext

```typescript
async maintainContext(conversationId: string): Promise<ConversationContext>
```

Retrieve and maintain conversation context.

**Returns:** `ConversationContext` with recent messages, working memory, and summary.

##### callTool

```typescript
async callTool(
  toolName: string,
  params: any,
  conversationId: string
): Promise<any>
```

Call a specific tool and track in working memory.

##### evaluateToolResult

```typescript
async evaluateToolResult(
  result: any,
  expectedOutcome: string,
  conversationId: string
): Promise<{ success: boolean; evaluation: string }>
```

Evaluate if a tool result meets expectations.

## Response Types

### AgentResponse

```typescript
interface AgentResponse {
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
```

### Intent Types

```typescript
type Intent =
  | 'upload'
  | 'query'
  | 'edit'
  | 'delete'
  | 'visualize'
  | 'general'
  | 'clarification';
```

## Memory Management

### Conversation History

All conversations are stored in MongoDB with:
- Full message history
- Timestamps
- User and patient IDs
- Conversation summaries (auto-generated every 10 messages)
- Archived status

### Working Memory

Active conversations maintain working memory with:
- Current task and state
- Observations from sub-agents
- Reasoning steps
- Tool call history
- Reflections and corrections

Working memory is cached in Redis for fast access and persisted to MongoDB for durability.

## Best Practices

### 1. Always Provide Patient ID

For medical operations (query, edit, delete, visualize), always provide the patient ID:

```typescript
const response = await supervisor.processUserInput(
  "Show my lab results",
  conversationId,
  userId,
  patientId // Required for medical operations
);
```

### 2. Handle Follow-Up Requests

Check `requiresFollowUp` flag and handle accordingly:

```typescript
const response = await supervisor.processUserInput(input, ...);

if (response.requiresFollowUp) {
  // Prompt user for additional information
  // or handle clarification request
}
```

### 3. Monitor Reasoning

Use the `reasoning` field for debugging and transparency:

```typescript
console.log('Supervisor reasoning:', response.reasoning);
console.log('Intent classified as:', response.intent);
console.log('Routed to:', response.subAgentUsed);
```

### 4. Maintain Conversation Context

Use the same `conversationId` for related messages to maintain context:

```typescript
// First message
const response1 = await supervisor.processUserInput(
  "Upload my lab results",
  "conv_123", // Same conversation ID
  userId,
  patientId
);

// Follow-up message
const response2 = await supervisor.processUserInput(
  "What were the cholesterol levels?",
  "conv_123", // Same conversation ID maintains context
  userId,
  patientId
);
```

### 5. Periodic Summary Updates

Conversation summaries are auto-generated every 10 messages, but you can manually trigger:

```typescript
await memoryService.updateConversationSummary(conversationId);
```

## Error Handling

The supervisor handles errors gracefully:

```typescript
const response = await supervisor.processUserInput(input, ...);

if (!response.success) {
  console.error('Error:', response.message);
  
  if (response.requiresFollowUp) {
    // User can retry or provide more information
  }
}
```

Common error scenarios:
- Missing patient ID
- Sub-agent failures
- Invalid input
- Resource not found

## Performance Considerations

### Memory Access

- Redis cache: < 10ms for working memory
- MongoDB: < 100ms for conversation history
- Automatic cleanup of expired working memory

### LLM Calls

- Intent classification: ~1-2 seconds
- Response synthesis: ~1-2 seconds
- Total overhead: ~2-4 seconds per request

### Optimization Tips

1. Use Redis caching for hot conversations
2. Limit conversation history to last 10 messages for context
3. Generate summaries periodically instead of on every request
4. Use temperature=0 for deterministic intent classification

## Testing

### Unit Tests

```typescript
describe('SupervisorAgent', () => {
  it('should classify upload intent correctly', async () => {
    const response = await supervisor.processUserInput(
      "I want to upload a document",
      conversationId,
      userId,
      patientId
    );
    
    expect(response.intent).toBe('upload');
    expect(response.subAgentUsed).toBe('UploadAgent');
  });
  
  it('should request patient ID when missing', async () => {
    const response = await supervisor.processUserInput(
      "Show my medications",
      conversationId,
      userId
      // No patientId
    );
    
    expect(response.success).toBe(false);
    expect(response.message).toContain('Patient ID is required');
    expect(response.requiresFollowUp).toBe(true);
  });
});
```

### Integration Tests

```typescript
describe('SupervisorAgent Integration', () => {
  it('should handle multi-step workflow', async () => {
    // Step 1: Upload document
    const upload = await supervisor.processUserInput(
      "Upload my lab results: Cholesterol 200 mg/dL",
      conversationId,
      userId,
      patientId
    );
    expect(upload.success).toBe(true);
    
    // Step 2: Query the uploaded document
    const query = await supervisor.processUserInput(
      "What was my cholesterol level?",
      conversationId,
      userId,
      patientId
    );
    expect(query.success).toBe(true);
    expect(query.message).toContain('200');
  });
});
```

## Troubleshooting

### Issue: Intent misclassification

**Solution**: Check conversation context and provide more specific input:

```typescript
// Instead of: "Update it"
// Use: "Update my blood pressure medication dosage"
```

### Issue: Missing patient ID errors

**Solution**: Always provide patient ID for medical operations:

```typescript
const response = await supervisor.processUserInput(
  input,
  conversationId,
  userId,
  patientId // Don't forget this!
);
```

### Issue: Context not maintained

**Solution**: Use consistent conversation ID:

```typescript
// Generate once and reuse
const conversationId = `conv_${Date.now()}`;

// Use same ID for all messages in conversation
await supervisor.processUserInput(msg1, conversationId, ...);
await supervisor.processUserInput(msg2, conversationId, ...);
```

## Future Enhancements

1. **Parallel Sub-Agent Execution**: Execute multiple sub-agents in parallel for complex queries
2. **Human-in-the-Loop**: Add approval workflows for critical operations
3. **Advanced Context Management**: Implement semantic memory for finding similar past conversations
4. **Streaming Responses**: Stream responses to client in real-time
5. **Multi-Turn Planning**: Plan multi-step workflows before execution

## Related Documentation

- [Upload Agent](./upload.agent.ts)
- [Query Agent](./query.agent.ts)
- [Edit Agent](./edit.agent.ts)
- [Delete Agent](./delete.agent.ts)
- [Visualization Agent](./visualization.agent.ts)
- [Memory Service](../service/memory.service.ts)
