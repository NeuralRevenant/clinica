# Design Document: Intelligent Medical Assistant

## Overview

The Intelligent Medical Assistant is a HIPAA-compliant agentic system that enables clinicians and patients to interact with medical documents through natural language. The system combines a conversational AI interface with robust document management, semantic search, and graph-based visualizations.

### Core Design Principles

1. **Conversational-First Interface**: All functionality accessible through natural language, with traditional UI as a complementary option
2. **Agentic Architecture**: Supervisor agent orchestrates specialized sub-agents for different tasks
3. **Dual Storage Strategy**: MongoDB for flexible document storage, OpenSearch for fast semantic search
4. **HIPAA Compliance by Design**: Security and privacy built into every layer
5. **Format Flexibility**: Support both structured FHIR and unstructured documents

### Technology Stack

- **Backend**: Node.js with TypeScript, Fastify framework
- **AI/ML**: 
  - **LangChain.js** (latest) - Primary framework for agent orchestration, tool calling, and reasoning
  - **LangGraph.js** - Used selectively for complex multi-agent coordination and human-in-the-loop
  - **OpenAI GPT-4** for language understanding and reasoning
  - **LangChain Expression Language (LCEL)** for composable chains
  - **Structured Output** with Zod schemas for type-safe tool calling
- **Storage**: MongoDB for primary data store, Redis for caching and hot memory
- **Search**: OpenSearch for semantic and hybrid search with vector embeddings
- **Frontend**: React.js with Material-UI
- **Security**: OAuth 2.0, AES-256 encryption, TLS 1.3

## Architecture

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Chat Interface│  │ Document UI  │  │ Graph Viewer │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Chat API     │  │ FHIR API     │  │ Document API │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Agent Layer                             │
│  ┌──────────────────────────────────────────────────┐       │
│  │            Supervisor Agent                       │       │
│  │  (Intent Classification & Task Routing)          │       │
│  └──────────────────────────────────────────────────┘       │
│           │          │          │          │                 │
│           ▼          ▼          ▼          ▼                 │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐           │
│  │ Upload │  │ Query  │  │ Edit   │  │ Delete │            │
│  │ Agent  │  │ Agent  │  │ Agent  │  │ Agent  │            │
│  └────────┘  └────────┘  └────────┘  └────────┘            │
│                    │                                         │
│                    ▼                                         │
│           ┌────────────────┐                                │
│           │ Visualization  │                                │
│           │     Agent      │                                │
│           └────────────────┘                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Document     │  │ Search       │  │ FHIR         │      │
│  │ Service      │  │ Service      │  │ Service      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Embedding    │  │ Entity       │  │ Graph        │      │
│  │ Service      │  │ Extraction   │  │ Service      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                                │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │      MongoDB         │  │     OpenSearch       │        │
│  │  (Document Store)    │  │   (Search Index)     │        │
│  └──────────────────────┘  └──────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### Design Rationale

**Why Agentic Architecture?**
- Enables natural language interaction for all operations
- Modular design allows independent development and testing of specialized agents
- Supervisor pattern provides centralized orchestration and context management
- Supports complex multi-step workflows through LangGraph

**Why Dual Storage (MongoDB + OpenSearch)?**
- MongoDB provides flexible schema for diverse document types (FHIR, PDF, text)
- OpenSearch enables fast semantic search with vector embeddings
- Separation of concerns: transactional storage vs. search optimization
- MongoDB handles ACID transactions for data integrity
- OpenSearch provides sub-second search response times

**Why LangChain (with selective LangGraph)?**
- Industry-standard framework for building AI agents
- Built-in ReAct reasoning loop with automatic tool calling
- Native support for conversation memory and context
- Structured output for reliable parsing
- Extensive ecosystem of integrations and tools
- LangGraph used only when explicit state management or human-in-the-loop needed

## Components and Interfaces

### 1. Agent Layer

#### Agent Memory System

**Design Decision: MongoDB for Long-Term Memory, In-Memory + MongoDB for Short-Term**

**Rationale:**
- **Long-Term Memory (Conversation History)**: MongoDB is optimal because:
  - Structured conversation data with nested messages
  - Need for complex queries (filter by user, date, patient)
  - ACID transactions for data integrity
  - Efficient pagination for chat list UI
  - Lower cost for large historical data storage
  
- **Short-Term Memory (Working Memory)**: Hybrid approach:
  - In-memory (Redis) for active conversations (< 1 hour old) for sub-second access
  - MongoDB for persistence and recovery after agent restarts
  - Automatic eviction from Redis after conversation ends

- **Why not OpenSearch for memory?**
  - OpenSearch optimized for search, not transactional updates
  - Higher latency for frequent read/write operations
  - More expensive for storing large conversation histories
  - Conversation retrieval is by ID, not semantic search

**Memory Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Memory System                       │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Short-Term Working Memory                   │    │
│  │  (Active conversation, current task state)         │    │
│  │                                                      │    │
│  │  Redis Cache (Hot)  ←→  MongoDB (Warm)            │    │
│  │  - Current observations                             │    │
│  │  - Reasoning steps                                  │    │
│  │  - Tool call history                                │    │
│  │  - Reflections                                      │    │
│  │                                                      │    │
│  │  TTL: 1 hour after last activity                   │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Long-Term Conversation Memory               │    │
│  │  (Full conversation history, all users)            │    │
│  │                                                      │    │
│  │  MongoDB (Cold)                                     │    │
│  │  - All messages                                     │    │
│  │  - Conversation summaries                           │    │
│  │  - User preferences                                 │    │
│  │  - Historical context                               │    │
│  │                                                      │    │
│  │  Retention: Configurable (default: indefinite)     │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │      Semantic Memory (Optional Enhancement)         │    │
│  │  (Semantic search over past conversations)         │    │
│  │                                                      │    │
│  │  OpenSearch                                         │    │
│  │  - Conversation embeddings                          │    │
│  │  - Find similar past conversations                  │    │
│  │  - Learn from historical patterns                   │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Memory Operations:**

```typescript
interface MemoryService {
  // Short-term memory
  getWorkingMemory(conversationId: string): Promise<WorkingMemory>;
  updateWorkingMemory(conversationId: string, update: Partial<WorkingMemory>): Promise<void>;
  addObservation(conversationId: string, observation: Observation): Promise<void>;
  addReasoning(conversationId: string, reasoning: Reasoning): Promise<void>;
  addToolCall(conversationId: string, toolCall: ToolCall): Promise<void>;
  addReflection(conversationId: string, reflection: Reflection): Promise<void>;
  clearWorkingMemory(conversationId: string): Promise<void>;
  
  // Long-term memory
  getConversation(conversationId: string): Promise<Conversation>;
  listConversations(userId: string, filters?: ConversationFilters): Promise<Conversation[]>;
  addMessage(conversationId: string, message: Message): Promise<void>;
  updateConversationSummary(conversationId: string): Promise<void>;
  archiveConversation(conversationId: string): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  
  // Semantic memory (future enhancement)
  findSimilarConversations(conversationId: string, limit: number): Promise<Conversation[]>;
}
```

#### Supervisor Agent

**Responsibilities:**
- Receive user natural language input
- Classify intent (upload, query, edit, delete, visualize)
- Route requests to appropriate sub-agents
- Maintain conversation context across interactions
- Coordinate multi-step workflows
- Synthesize responses from sub-agents
- Perform reasoning and self-reflection on agent actions
- Make tool calls and evaluate results
- Manage short-term and long-term memory

**Interface:**
```typescript
interface SupervisorAgent {
  processUserInput(input: string, conversationId: string): Promise<AgentResponse>;
  routeToSubAgent(intent: Intent, context: ConversationContext): Promise<SubAgentResult>;
  maintainContext(conversationId: string): ConversationContext;
  reason(observation: string, context: ConversationContext): Promise<ReasoningResult>;
  reflect(actionHistory: Action[], outcome: ActionOutcome): Promise<ReflectionResult>;
  callTool(toolName: string, params: any): Promise<ToolResult>;
  evaluateToolResult(result: ToolResult, expectedOutcome: string): Promise<Evaluation>;
}

interface AgentResponse {
  message: string;
  action?: string;
  data?: any;
  requiresFollowUp: boolean;
  reasoning?: string;
  toolCalls?: ToolCall[];
}

interface ReasoningResult {
  thought: string;
  nextAction: string;
  confidence: number;
}

interface ReflectionResult {
  wasSuccessful: boolean;
  lessonsLearned: string[];
  correctionNeeded: boolean;
  correctionPlan?: string;
}

interface ToolCall {
  toolName: string;
  parameters: any;
  result?: any;
  evaluation?: string;
}
```

**Implementation Approach:**
- Use LangChain's latest **createAgent** for modern agent creation with built-in reasoning
- Leverage **LangChain Expression Language (LCEL)** for composable agent chains
- Use **Structured Output** with Zod schemas for reliable tool calling
- Use **RunnableWithMessageHistory** for conversation memory management
- Leverage **ChatMessageHistory** with MongoDB backend for persistence
- Use **tool** decorator for easy tool registration
- Implement **streaming** for real-time response updates
- Use **LangGraph** only when needed for:
  - Complex multi-agent coordination requiring explicit state machines
  - Human-in-the-loop workflows with interrupt()
  - Parallel agent execution with Send
  - Custom conditional routing with Command()

**Design Decision: LangChain-First Approach**

For most operations (upload, query, edit, delete, visualize), LangChain's createAgent provides sufficient capabilities:
- Built-in ReAct reasoning loop
- Automatic tool calling and observation
- Self-correction through retry logic
- Conversation memory management

LangGraph will be used selectively for:
- Supervisor agent coordination when multiple sub-agents need orchestration
- Critical operations requiring human approval (e.g., bulk deletes, medication changes)
- Complex workflows with explicit state transitions

**Reasoning and Self-Reflection:**
The supervisor agent follows a reasoning loop:
1. **Observe**: Receive user input or tool result
2. **Reason**: Analyze the situation and determine next action
3. **Act**: Execute action (route to sub-agent or call tool)
4. **Evaluate**: Assess the outcome of the action
5. **Reflect**: Determine if correction is needed
6. **Correct**: If needed, adjust approach and retry

Example reasoning flow:
```
User: "Upload my recent blood test results"
→ Reason: User wants to upload a document, likely FHIR or PDF
→ Act: Route to Upload Agent
→ Observe: Upload Agent returns "Missing patient ID"
→ Reflect: Initial action failed, need to gather more information
→ Correct: Ask user for patient ID
→ Act: Request clarification from user
```

**Tool Calling Framework:**
The supervisor agent has access to tools:
- `searchDocuments`: Search for existing documents
- `validateFHIR`: Validate FHIR resources
- `extractEntities`: Extract medical entities from text
- `queryDatabase`: Query MongoDB directly
- `semanticSearch`: Perform OpenSearch semantic search
- `generateGraph`: Create graph visualization

Each tool call follows: Call → Observe Result → Evaluate → Decide Next Step

#### Upload Agent

**Responsibilities:**
- Process document uploads from natural language or file interface
- Parse FHIR JSON documents
- Extract text from PDFs and unstructured documents
- Extract medical entities (conditions, medications, procedures)
- Store documents in MongoDB
- Index documents in OpenSearch
- Generate vector embeddings
- Reason about document type and validation requirements
- Self-correct on validation failures

**Interface:**
```typescript
interface UploadAgent extends BaseAgent {
  processNaturalLanguageUpload(text: string, patientId: string): Promise<DocumentResult>;
  processFileUpload(file: File, patientId: string): Promise<DocumentResult>;
  parseFHIRDocument(fhirJson: any): Promise<FHIRResources>;
  extractTextFromPDF(file: Buffer): Promise<string>;
}

interface DocumentResult {
  documentId: string;
  documentType: 'fhir' | 'pdf' | 'text' | 'markdown';
  status: 'success' | 'error';
  message: string;
  reasoning?: string;
  corrections?: string[];
}

interface BaseAgent {
  reason(context: AgentContext): Promise<ReasoningResult>;
  reflect(outcome: ActionOutcome): Promise<ReflectionResult>;
  callTool(toolName: string, params: any): Promise<ToolResult>;
  evaluateResult(result: any, expected: any): Promise<Evaluation>;
  correct(error: Error, context: AgentContext): Promise<CorrectionPlan>;
}
```

**Reasoning Example:**
```
User: "Here's my lab report: Hemoglobin 14.2 g/dL, WBC 7500..."
→ Reason: This looks like observation data, not a complete document
→ Tool Call: extractEntities(text)
→ Observe: Found Hemoglobin and WBC observations
→ Reason: Should create FHIR Observation resources
→ Tool Call: validateFHIR(observations)
→ Observe: Validation failed - missing patient reference
→ Reflect: Need patient ID from context
→ Correct: Request patient ID from supervisor
→ Act: Return partial result with clarification request
```

#### Query Agent

**Responsibilities:**
- Interpret natural language queries
- Execute hybrid search (keyword + semantic)
- Retrieve relevant documents from OpenSearch
- Synthesize answers from multiple documents
- Cite sources with document IDs and timestamps
- Handle ambiguous queries with clarification requests
- Reason about query intent and search strategy
- Evaluate search results and refine if needed

**Interface:**
```typescript
interface QueryAgent extends BaseAgent {
  processQuery(query: string, patientId: string): Promise<QueryResult>;
  executeHybridSearch(query: string, filters: SearchFilters): Promise<SearchResults>;
  synthesizeAnswer(documents: Document[], query: string): Promise<string>;
  refineQuery(originalQuery: string, results: SearchResults): Promise<string>;
}

interface QueryResult {
  answer: string;
  sources: DocumentReference[];
  confidence: number;
  needsClarification: boolean;
  reasoning?: string;
  searchStrategy?: string;
  refinementAttempts?: number;
}
```

**Reasoning Example:**
```
User: "What medications am I taking for my heart?"
→ Reason: User asking about medications related to cardiovascular conditions
→ Tool Call: semanticSearch("medications cardiovascular heart")
→ Observe: Found 15 results, but many are unrelated
→ Reflect: Too broad, need to filter by active medications
→ Correct: Refine search with status filter
→ Tool Call: semanticSearch("medications cardiovascular", filters: {status: "active"})
→ Observe: Found 3 relevant medications
→ Evaluate: High confidence, results are specific
→ Act: Synthesize answer with citations
```

#### Edit Agent

**Responsibilities:**
- Identify target document and fields to modify
- Validate edits against FHIR schema (if applicable)
- Update document in MongoDB
- Re-index in OpenSearch
- Maintain audit log
- Support both natural language and structured edits
- Reason about edit intent and safety
- Validate changes before committing

**Interface:**
```typescript
interface EditAgent extends BaseAgent {
  processNaturalLanguageEdit(instruction: string, patientId: string): Promise<EditResult>;
  processStructuredEdit(documentId: string, updates: Partial<Document>): Promise<EditResult>;
  validateFHIREdit(resource: any, updates: any): ValidationResult;
  identifyTargetDocument(instruction: string, patientId: string): Promise<Document>;
  previewChanges(document: Document, updates: any): Promise<ChangePreview>;
}

interface EditResult {
  documentId: string;
  fieldsModified: string[];
  status: 'success' | 'error';
  message: string;
  auditLogId: string;
  reasoning?: string;
  validationWarnings?: string[];
}

interface ChangePreview {
  before: any;
  after: any;
  risks: string[];
  requiresConfirmation: boolean;
}
```

**Reasoning Example:**
```
User: "Update my blood pressure medication dosage to 20mg"
→ Reason: User wants to modify medication dosage
→ Tool Call: searchDocuments("blood pressure medication", patientId)
→ Observe: Found 2 medications: Lisinopril 10mg, Amlodipine 5mg
→ Reflect: Ambiguous - which medication?
→ Correct: Ask for clarification
→ User: "The Lisinopril"
→ Tool Call: getDocument(lisinoprilDocId)
→ Reason: Changing dosage from 10mg to 20mg (doubling)
→ Tool Call: validateFHIREdit(medication, {dosage: "20mg"})
→ Observe: Validation passed
→ Reflect: Significant dosage change, should warn user
→ Act: Preview changes and request confirmation
→ User confirms
→ Tool Call: updateDocument(docId, changes)
→ Observe: Update successful
→ Act: Confirm to user with audit log
```

#### Delete Agent

**Responsibilities:**
- Identify document to delete from natural language or direct ID
- Remove from MongoDB
- Remove from OpenSearch index
- Create audit log entry
- Handle cascading deletes if needed
- Reason about delete safety and implications
- Confirm destructive operations

**Interface:**
```typescript
interface DeleteAgent extends BaseAgent {
  processNaturalLanguageDelete(instruction: string, patientId: string): Promise<DeleteResult>;
  processDirectDelete(documentId: string): Promise<DeleteResult>;
  identifyTargetDocument(instruction: string, patientId: string): Promise<Document>;
  assessDeleteImpact(documentId: string): Promise<DeleteImpact>;
}

interface DeleteResult {
  documentId: string;
  status: 'success' | 'error';
  message: string;
  auditLogId: string;
  reasoning?: string;
}

interface DeleteImpact {
  affectedDocuments: string[];
  risks: string[];
  requiresConfirmation: boolean;
}
```

**Reasoning Example:**
```
User: "Delete my old lab results from 2020"
→ Reason: User wants to delete multiple documents by date
→ Tool Call: searchDocuments("lab results", {dateRange: "2020"})
→ Observe: Found 12 lab result documents
→ Reflect: Bulk delete operation, high risk
→ Tool Call: assessDeleteImpact(documentIds)
→ Observe: No dependencies, but permanent deletion
→ Reason: Should confirm with user and show what will be deleted
→ Act: Present list and request confirmation
→ User confirms
→ Tool Call: deleteDocuments(documentIds)
→ Observe: 12 documents deleted successfully
→ Act: Confirm deletion with audit log IDs
```

#### Visualization Agent

**Responsibilities:**
- Extract medical entities and relationships from documents
- Build graph structure (nodes: conditions, medications, procedures; edges: relationships)
- Generate graph visualization data
- Support interactive exploration
- Reason about relevant entities for visualization
- Evaluate graph quality and completeness

**Interface:**
```typescript
interface VisualizationAgent extends BaseAgent {
  generateGraph(query: string, patientId: string): Promise<GraphData>;
  extractRelationships(documents: Document[]): Promise<Relationship[]>;
  identifyRelevantEntities(query: string, patientId: string): Promise<Entity[]>;
  evaluateGraphQuality(graph: GraphData): Promise<GraphQualityMetrics>;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: GraphMetadata;
  reasoning?: string;
  qualityScore?: number;
}

interface GraphNode {
  id: string;
  type: 'condition' | 'medication' | 'procedure' | 'observation';
  label: string;
  properties: Record<string, any>;
}

interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  weight: number;
  confidence: number;
}

interface GraphQualityMetrics {
  completeness: number;
  connectivity: number;
  relevance: number;
  suggestions: string[];
}
```

**Reasoning Example:**
```
User: "Show me how my diabetes medications relate to my conditions"
→ Reason: User wants graph of diabetes medications and related conditions
→ Tool Call: searchDocuments("diabetes medications conditions", patientId)
→ Observe: Found 5 medications, 3 conditions, 8 observations
→ Reason: Need to identify relationships between these entities
→ Tool Call: extractRelationships(documents)
→ Observe: Found relationships: Metformin→Type2Diabetes, Insulin→Type2Diabetes, etc.
→ Tool Call: evaluateGraphQuality(graph)
→ Observe: Completeness 70%, missing recent A1C observations
→ Reflect: Graph is incomplete, should include recent observations
→ Tool Call: searchDocuments("A1C hemoglobin", patientId, {recent: true})
→ Observe: Found 2 recent A1C results
→ Reason: Add these to graph for better context
→ Act: Generate enhanced graph with all entities
→ Evaluate: Completeness now 95%, high relevance
→ Act: Return graph with quality metrics
```

#### LangChain/LangGraph Implementation Patterns

**LangChain.js Features Used:**

1. **Modern Agent Creation with createAgent:**
```typescript
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";

const model = new ChatOpenAI({ 
  modelName: "gpt-4",
  temperature: 0 
});

const agent = await createAgent({
  llm: model,
  tools: [searchDocumentsTool, validateFHIRTool, extractEntitiesTool],
  checkpointer: new MemorySaver(), // For state persistence
  messageModifier: systemPrompt, // Custom system instructions
});
```

2. **Tool Definition with @langchain/core:**
```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const searchDocumentsTool = tool(
  async ({ query, patientId, filters }) => {
    // Implementation
    return await documentService.search(query, patientId, filters);
  },
  {
    name: "search_documents",
    description: "Search for medical documents using semantic and keyword search",
    schema: z.object({
      query: z.string().describe("The search query"),
      patientId: z.string().describe("Patient identifier"),
      filters: z.object({
        documentType: z.string().optional(),
        dateRange: z.object({
          start: z.string(),
          end: z.string()
        }).optional()
      }).optional()
    })
  }
);
```

3. **Conversation Memory with RunnableWithMessageHistory:**
```typescript
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { MongoDBChatMessageHistory } from "@langchain/mongodb";

const agentWithMemory = new RunnableWithMessageHistory({
  runnable: agent,
  getMessageHistory: async (sessionId) => {
    return new MongoDBChatMessageHistory({
      collection: conversationsCollection,
      sessionId,
    });
  },
  inputMessagesKey: "input",
  historyMessagesKey: "chat_history",
});
```

4. **Structured Output for Reliable Parsing:**
```typescript
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

const ReasoningSchema = z.object({
  thought: z.string().describe("Current reasoning step"),
  action: z.enum(["search", "validate", "extract", "complete"]),
  actionInput: z.record(z.any()).describe("Parameters for the action"),
  confidence: z.number().min(0).max(1)
});

const llmWithStructuredOutput = model.withStructuredOutput(ReasoningSchema);
```

5. **LCEL Chains for Composability:**
```typescript
import { RunnableSequence } from "@langchain/core/runnables";
import { PromptTemplate } from "@langchain/core/prompts";

const queryChain = RunnableSequence.from([
  PromptTemplate.fromTemplate("Analyze this medical query: {query}"),
  model,
  searchDocumentsTool,
  PromptTemplate.fromTemplate("Synthesize answer from: {documents}"),
  model
]);
```

**LangGraph.js for Multi-Agent Workflows:**

```typescript
import { StateGraph, END, START, Command } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

// Define state schema with Annotation
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  intent: Annotation<string>(),
  currentAgent: Annotation<string>(),
  documents: Annotation<Document[]>(),
  needsClarification: Annotation<boolean>(),
  result: Annotation<any>(),
});

// Create state graph
const workflow = new StateGraph(AgentState);

// Add nodes for each agent
workflow.addNode("supervisor", supervisorNode);
workflow.addNode("upload", uploadAgentNode);
workflow.addNode("query", queryAgentNode);
workflow.addNode("edit", editAgentNode);
workflow.addNode("delete", deleteAgentNode);
workflow.addNode("visualize", visualizationAgentNode);

// Use Command() for conditional routing with dynamic state updates
workflow.addConditionalEdges(
  "supervisor",
  async (state) => {
    if (state.needsClarification) {
      return new Command({
        goto: "supervisor",
        update: { needsClarification: false }
      });
    }
    
    // Route to appropriate agent based on intent
    return new Command({
      goto: state.intent,
      update: { currentAgent: state.intent }
    });
  }
);

// All agents return to supervisor for coordination
workflow.addEdge("upload", "supervisor");
workflow.addEdge("query", "supervisor");
workflow.addEdge("edit", "supervisor");
workflow.addEdge("delete", "supervisor");
workflow.addEdge("visualize", "supervisor");

// Set entry point
workflow.addEdge(START, "supervisor");

// Compile graph with checkpointer
const app = workflow.compile({
  checkpointer: new MemorySaver()
});
```

**Parallel Agent Execution:**

```typescript
import { Send } from "@langchain/langgraph";

// Execute multiple agents in parallel
workflow.addConditionalEdges(
  "supervisor",
  async (state) => {
    // When multiple operations needed, execute in parallel
    if (state.intent === "complex_query") {
      return [
        new Send("query", { ...state, subTask: "search" }),
        new Send("visualize", { ...state, subTask: "graph" }),
      ];
    }
    return new Command({ goto: state.intent });
  }
);

// Aggregation node to combine parallel results
workflow.addNode("aggregate", async (state) => {
  // Combine results from parallel agents
  return {
    ...state,
    result: combineResults(state.documents, state.graph)
  };
});
```

**Human-in-the-Loop for Critical Operations:**

```typescript
import { interrupt } from "@langchain/langgraph";

// Edit agent with human confirmation
const editAgentNode = async (state: typeof AgentState.State) => {
  const changes = await identifyChanges(state);
  
  // For critical changes, interrupt and wait for human approval
  if (changes.isCritical) {
    const approval = interrupt({
      value: {
        message: "Approve these changes?",
        changes: changes.preview
      }
    });
    
    if (!approval) {
      return new Command({
        goto: "supervisor",
        update: { 
          result: "Changes rejected by user",
          needsClarification: true 
        }
      });
    }
  }
  
  // Proceed with changes
  await applyChanges(changes);
  
  return new Command({
    goto: "supervisor",
    update: { result: "Changes applied successfully" }
  });
};
```

**Self-Reflection with LangGraph:**

```typescript
// Add reflection node
workflow.addNode("reflect", async (state: typeof AgentState.State) => {
  const reflectionPrompt = `
    Review the recent actions and their outcomes:
    ${JSON.stringify(state.messages.slice(-5))}
    
    Was the task completed successfully?
    If not, what correction is needed?
  `;
  
  const reflection = await model.invoke(reflectionPrompt);
  const needsCorrection = reflection.content.includes("clarification");
  
  if (needsCorrection) {
    return new Command({
      goto: "supervisor",
      update: { 
        needsClarification: true,
        result: null 
      }
    });
  }
  
  return new Command({
    goto: END,
    update: { result: state.result }
  });
});

// Add conditional edge for reflection using Command
workflow.addEdge("query", "reflect");
workflow.addEdge("upload", "reflect");
```

**Subgraphs for Complex Agent Workflows:**

```typescript
import { StateGraph } from "@langchain/langgraph";

// Create a subgraph for document processing
const documentProcessingGraph = new StateGraph(AgentState);

documentProcessingGraph.addNode("extract", extractTextNode);
documentProcessingGraph.addNode("validate", validateNode);
documentProcessingGraph.addNode("store", storeNode);

documentProcessingGraph.addEdge(START, "extract");
documentProcessingGraph.addEdge("extract", "validate");
documentProcessingGraph.addConditionalEdges(
  "validate",
  (state) => {
    if (state.validationErrors) {
      return new Command({ goto: "extract" }); // Retry extraction
    }
    return new Command({ goto: "store" });
  }
);
documentProcessingGraph.addEdge("store", END);

const documentSubgraph = documentProcessingGraph.compile();

// Use subgraph in main workflow
workflow.addNode("processDocument", documentSubgraph);
```

**Streaming Responses:**

```typescript
import { RunnableConfig } from "@langchain/core/runnables";

// Stream agent responses to client
const stream = await agentWithMemory.stream(
  { input: userMessage },
  {
    configurable: { sessionId: conversationId },
    callbacks: [{
      handleLLMNewToken(token: string) {
        // Send token to client via WebSocket or SSE
        websocket.send(JSON.stringify({ type: "token", data: token }));
      },
      handleToolStart(tool, input) {
        websocket.send(JSON.stringify({ 
          type: "tool_start", 
          tool: tool.name, 
          input 
        }));
      },
      handleToolEnd(output) {
        websocket.send(JSON.stringify({ 
          type: "tool_end", 
          output 
        }));
      }
    }]
  }
);
```

#### Agent Tool System

**Available Tools:**

All agents have access to a shared tool registry:

```typescript
interface ToolRegistry {
  // Document operations
  searchDocuments(query: string, filters: SearchFilters): Promise<Document[]>;
  getDocument(documentId: string): Promise<Document>;
  createDocument(doc: CreateDocumentDTO): Promise<Document>;
  updateDocument(documentId: string, updates: any): Promise<Document>;
  deleteDocument(documentId: string): Promise<void>;
  
  // FHIR operations
  validateFHIR(resource: any, resourceType: string): Promise<ValidationResult>;
  parseFHIRBundle(bundle: any): Promise<FHIRResource[]>;
  
  // Search operations
  semanticSearch(query: string, filters: any): Promise<SearchResults>;
  hybridSearch(textQuery: string, vectorQuery: number[], filters: any): Promise<SearchResults>;
  
  // Entity operations
  extractEntities(text: string): Promise<MedicalEntity[]>;
  normalizeEntity(entity: string, type: EntityType): Promise<NormalizedEntity>;
  
  // Graph operations
  buildGraph(entityIds: string[]): Promise<GraphData>;
  findRelationships(entityIds: string[]): Promise<Relationship[]>;
  
  // Memory operations
  getConversationContext(conversationId: string): Promise<ConversationContext>;
  updateWorkingMemory(conversationId: string, update: any): Promise<void>;
  
  // Utility operations
  generateEmbedding(text: string): Promise<number[]>;
  summarizeText(text: string, maxLength: number): Promise<string>;
  classifyIntent(text: string): Promise<Intent>;
}
```

**Tool Call Pattern:**

Every tool call follows this pattern:
1. **Plan**: Agent decides which tool to call and why
2. **Execute**: Tool is called with parameters
3. **Observe**: Agent receives tool result
4. **Evaluate**: Agent assesses if result meets expectations
5. **Decide**: Agent determines next action (continue, retry, correct, or complete)

**Example Tool Call Flow with Modern LangChain:**
```typescript
import { createAgent } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";

// Modern agent creation with createAgent
async function processUserInput(
  input: string, 
  conversationId: string
): Promise<AgentResponse> {
  
  // Create agent with tools
  const agent = await createAgent({
    llm: model,
    tools: allTools,
    checkpointer: memorySaver,
    messageModifier: `You are a medical assistant. Use tools to help users manage their medical documents.`,
  });
  
  // Invoke agent - it will automatically:
  // 1. Reason about what to do
  // 2. Call appropriate tools
  // 3. Observe results
  // 4. Reflect and retry if needed
  // 5. Return final answer
  const result = await agent.invoke(
    { messages: [new HumanMessage(input)] },
    { 
      configurable: { thread_id: conversationId },
      recursionLimit: 10 // Max reasoning iterations
    }
  );
  
  return {
    message: result.messages[result.messages.length - 1].content,
    toolCalls: extractToolCalls(result.messages),
    reasoning: extractReasoning(result.messages)
  };
}

// For custom control flow with Command(), use LangGraph
async function customAgentWorkflow(
  input: string,
  conversationId: string
): Promise<AgentResponse> {
  
  const result = await workflowApp.invoke(
    {
      messages: [new HumanMessage(input)],
      intent: "",
      currentAgent: "supervisor",
      documents: [],
      needsClarification: false
    },
    {
      configurable: { thread_id: conversationId },
      recursionLimit: 20 // Allow more steps for multi-agent workflow
    }
  );
  
  return result;
}

// Stream with updates
async function streamAgentResponse(
  input: string,
  conversationId: string
) {
  const stream = await workflowApp.stream(
    { messages: [new HumanMessage(input)] },
    { 
      configurable: { thread_id: conversationId },
      streamMode: "updates" // Get updates as each node completes
    }
  );
  
  for await (const update of stream) {
    console.log("Node update:", update);
    // Send update to client
  }
}
```

**Self-Correction Strategies:**

1. **Validation Failure**: If tool result fails validation, agent analyzes error and adjusts parameters
2. **Insufficient Results**: If search returns too few results, agent broadens query
3. **Too Many Results**: If search returns too many results, agent adds filters
4. **Ambiguity**: If multiple interpretations possible, agent requests clarification
5. **Dependency Missing**: If required data missing, agent gathers prerequisites first

### 2. Service Layer

#### Document Service

**Responsibilities:**
- CRUD operations for all document types
- Document validation
- Encryption/decryption of PHI
- Metadata management
- Version control

**Interface:**
```typescript
interface DocumentService {
  createDocument(doc: CreateDocumentDTO): Promise<Document>;
  getDocument(documentId: string): Promise<Document>;
  updateDocument(documentId: string, updates: Partial<Document>): Promise<Document>;
  deleteDocument(documentId: string): Promise<void>;
  listDocuments(patientId: string, filters: DocumentFilters): Promise<Document[]>;
}
```

#### Search Service

**Responsibilities:**
- Indexing documents in OpenSearch
- Hybrid search execution (keyword + semantic)
- Vector embedding generation
- Search result ranking
- Index synchronization with MongoDB

**Interface:**
```typescript
interface SearchService {
  indexDocument(doc: Document): Promise<void>;
  search(query: SearchQuery): Promise<SearchResults>;
  hybridSearch(textQuery: string, vectorQuery: number[], filters: any): Promise<SearchResults>;
  deleteFromIndex(documentId: string): Promise<void>;
  reindex(documentId: string): Promise<void>;
}

interface SearchQuery {
  text: string;
  patientId?: string;
  documentType?: string;
  dateRange?: DateRange;
  limit: number;
}
```

#### FHIR Service

**Responsibilities:**
- FHIR resource validation against R4 specification
- FHIR resource parsing and extraction
- FHIR API endpoint implementation
- FHIR search parameter handling

**Interface:**
```typescript
interface FHIRService {
  validateResource(resource: any, resourceType: string): ValidationResult;
  parseBundle(bundle: any): FHIRResource[];
  extractResources(fhirDoc: any): FHIRResource[];
  searchResources(resourceType: string, params: FHIRSearchParams): Promise<FHIRBundle>;
}
```

#### Embedding Service

**Responsibilities:**
- Generate vector embeddings for text
- Batch embedding generation
- Embedding model management
- Caching for performance

**Interface:**
```typescript
interface EmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
}
```

**Implementation:**
- Use OpenAI text-embedding-ada-002 model
- Implement caching layer (Redis) for frequently embedded texts
- Batch processing for efficiency

#### Entity Extraction Service

**Responsibilities:**
- Extract medical entities from unstructured text
- Identify conditions, medications, procedures, observations
- Named entity recognition (NER)
- Medical concept normalization

**Interface:**
```typescript
interface EntityExtractionService {
  extractEntities(text: string): Promise<MedicalEntity[]>;
  normalizeEntity(entity: string, type: EntityType): Promise<NormalizedEntity>;
}

interface MedicalEntity {
  text: string;
  type: 'condition' | 'medication' | 'procedure' | 'observation';
  startOffset: number;
  endOffset: number;
  confidence: number;
  normalizedCode?: string;
}
```

**Implementation:**
- Use GPT-4 for entity extraction with medical prompts
- Consider specialized medical NER models (e.g., BioBERT) for production
- Map entities to standard terminologies (SNOMED CT, RxNorm, LOINC)

#### Graph Service

**Responsibilities:**
- Build graph structures from medical data
- Identify relationships between entities
- Graph traversal and querying
- Graph visualization data generation

**Interface:**
```typescript
interface GraphService {
  buildPatientGraph(patientId: string): Promise<GraphData>;
  findRelationships(entityIds: string[]): Promise<Relationship[]>;
  queryGraph(graphQuery: GraphQuery): Promise<GraphData>;
}
```

### 3. Data Layer

#### MongoDB Schema Design

**Patients Collection:**
```typescript
interface PatientDocument {
  _id: ObjectId;
  patientId: string; // unique identifier
  identifier: Array<{
    system: string;
    value: string;
  }>;
  name: {
    family: string;
    given: string[];
    prefix?: string[];
    suffix?: string[];
  };
  gender: 'male' | 'female' | 'other' | 'unknown';
  birthDate: Date;
  address: Array<{
    line: string[];
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }>;
  telecom: Array<{
    system: 'phone' | 'email' | 'fax';
    value: string;
    use: 'home' | 'work' | 'mobile';
  }>;
  maritalStatus?: string;
  communication: Array<{
    language: string;
    preferred: boolean;
  }>;
  generalPractitioner?: string[];
  managingOrganization?: string;
  active: boolean;
  deceasedBoolean?: boolean;
  deceasedDateTime?: Date;
  multipleBirthBoolean?: boolean;
  photo?: string[];
  contact: Array<{
    relationship: string;
    name: any;
    telecom: any[];
    address: any;
  }>;
  encryptionStatus: 'encrypted' | 'unencrypted';
  createdAt: Date;
  updatedAt: Date;
}
```

**Documents Collection:**
```typescript
interface MedicalDocumentSchema {
  _id: ObjectId;
  documentId: string;
  patientId: string;
  documentType: 'fhir' | 'pdf' | 'text' | 'markdown';
  fhirResourceType?: string;
  fhirResource?: any; // Complete FHIR resource object
  uploadTimestamp: Date;
  uploadMethod: 'naturalLanguage' | 'fileUpload';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  extractedText?: string;
  structuredData?: any;
  metadata: Record<string, any>;
  tags: string[];
  encryptionStatus: 'encrypted' | 'unencrypted';
  lastModified: Date;
  modifiedBy: string;
  version: number;
  auditLog: Array<{
    action: 'create' | 'update' | 'delete' | 'access';
    userId: string;
    timestamp: Date;
    changes?: any;
  }>;
}
```

**Observations Collection:**
```typescript
interface ObservationDocument {
  _id: ObjectId;
  observationId: string;
  patientId: string;
  code: {
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  };
  value: {
    quantity?: { value: number; unit: string; };
    string?: string;
    boolean?: boolean;
  };
  effectiveDateTime: Date;
  issued: Date;
  performer: string[];
  interpretation?: string;
  bodySite?: string;
  method?: string;
  referenceRange?: Array<{
    low: number;
    high: number;
    type: string;
  }>;
  category: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Conditions Collection:**
```typescript
interface ConditionDocument {
  _id: ObjectId;
  conditionId: string;
  patientId: string;
  code: {
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  };
  clinicalStatus: string;
  verificationStatus: string;
  severity?: string;
  onsetDateTime?: Date;
  abatementDateTime?: Date;
  recordedDate: Date;
  recorder?: string;
  asserter?: string;
  stage?: any;
  evidence?: any[];
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Medications Collection:**
```typescript
interface MedicationDocument {
  _id: ObjectId;
  medicationId: string;
  patientId: string;
  code: {
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  };
  status: string;
  dosage: {
    text: string;
    route?: string;
    doseQuantity?: { value: number; unit: string; };
    timing?: any;
  };
  effectivePeriod?: {
    start: Date;
    end?: Date;
  };
  dateAsserted: Date;
  informationSource?: string;
  reasonCode?: string[];
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Conversations Collection (Long-Term Memory):**
```typescript
interface ConversationDocument {
  _id: ObjectId;
  conversationId: string;
  userId: string;
  patientId?: string;
  title: string; // Auto-generated summary of conversation
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    metadata?: any;
    toolCalls?: ToolCall[];
    reasoning?: string;
  }>;
  context: Record<string, any>;
  summary: string; // Periodic summary for quick context retrieval
  createdAt: Date;
  lastActivity: Date;
  archived: boolean;
  ttl?: Date; // Optional auto-delete for privacy (configurable per user)
}
```

**Agent Memory Collection (Short-Term Working Memory):**
```typescript
interface AgentMemoryDocument {
  _id: ObjectId;
  conversationId: string;
  agentType: 'supervisor' | 'upload' | 'query' | 'edit' | 'delete' | 'visualization';
  workingMemory: {
    currentTask: string;
    taskState: 'planning' | 'executing' | 'evaluating' | 'completed' | 'failed';
    observations: Array<{
      timestamp: Date;
      observation: string;
      source: string;
    }>;
    reasoning: Array<{
      timestamp: Date;
      thought: string;
      decision: string;
    }>;
    toolCallHistory: Array<{
      toolName: string;
      parameters: any;
      result: any;
      evaluation: string;
      timestamp: Date;
    }>;
    reflections: Array<{
      timestamp: Date;
      reflection: string;
      correctionNeeded: boolean;
      correctionPlan?: string;
    }>;
  };
  createdAt: Date;
  expiresAt: Date; // Auto-delete after conversation ends
}
```

#### OpenSearch Index Design

**Patients Index:**
```json
{
  "mappings": {
    "properties": {
      "patientId": { "type": "keyword" },
      "fullName": { "type": "text" },
      "familyName": { "type": "text" },
      "givenName": { "type": "text" },
      "gender": { "type": "keyword" },
      "birthDate": { "type": "date" },
      "age": { "type": "integer" },
      "city": { "type": "text" },
      "state": { "type": "keyword" },
      "postalCode": { "type": "keyword" },
      "phone": { "type": "keyword" },
      "email": { "type": "keyword" },
      "active": { "type": "boolean" },
      "identifierValues": { "type": "text" },
      "embeddingVector": {
        "type": "knn_vector",
        "dimension": 1536
      },
      "lastUpdated": { "type": "date" }
    }
  }
}
```

**Documents Index:**
```json
{
  "mappings": {
    "properties": {
      "documentId": { "type": "keyword" },
      "patientId": { "type": "keyword" },
      "patientName": { "type": "text" },
      "documentType": { "type": "keyword" },
      "fhirResourceType": { "type": "keyword" },
      "extractedText": { "type": "text" },
      "medicalEntities": {
        "properties": {
          "conditions": { "type": "text" },
          "medications": { "type": "text" },
          "procedures": { "type": "text" },
          "observations": { "type": "text" }
        }
      },
      "embeddingVector": {
        "type": "knn_vector",
        "dimension": 1536
      },
      "uploadTimestamp": { "type": "date" },
      "uploadMethod": { "type": "keyword" },
      "fileName": { "type": "text" },
      "tags": { "type": "keyword" },
      "keywords": { "type": "text" }
    }
  }
}
```

**Observations Index:**
```json
{
  "mappings": {
    "properties": {
      "observationId": { "type": "keyword" },
      "patientId": { "type": "keyword" },
      "patientName": { "type": "text" },
      "observationCode": { "type": "keyword" },
      "observationDisplay": { "type": "text" },
      "valueString": { "type": "text" },
      "valueQuantity": { "type": "float" },
      "effectiveDate": { "type": "date" },
      "category": { "type": "keyword" },
      "embeddingVector": {
        "type": "knn_vector",
        "dimension": 1536
      }
    }
  }
}
```

**Conditions Index:**
```json
{
  "mappings": {
    "properties": {
      "conditionId": { "type": "keyword" },
      "patientId": { "type": "keyword" },
      "patientName": { "type": "text" },
      "conditionCode": { "type": "keyword" },
      "conditionDisplay": { "type": "text" },
      "clinicalStatus": { "type": "keyword" },
      "severity": { "type": "keyword" },
      "onsetDate": { "type": "date" },
      "embeddingVector": {
        "type": "knn_vector",
        "dimension": 1536
      }
    }
  }
}
```

**Medications Index:**
```json
{
  "mappings": {
    "properties": {
      "medicationId": { "type": "keyword" },
      "patientId": { "type": "keyword" },
      "patientName": { "type": "text" },
      "medicationCode": { "type": "keyword" },
      "medicationDisplay": { "type": "text" },
      "dosageText": { "type": "text" },
      "status": { "type": "keyword" },
      "effectivePeriod": { "type": "date_range" },
      "embeddingVector": {
        "type": "knn_vector",
        "dimension": 1536
      }
    }
  }
}
```

### 4. API Layer

#### Chat API

**Endpoints:**
```
POST /api/chat/message
  - Send message to supervisor agent
  - Request: { conversationId?, message, patientId? }
  - Response: { response, action?, data?, conversationId, reasoning?, toolCalls? }

GET /api/chat/conversations
  - List all conversations for user
  - Query params: limit, offset, archived, patientId
  - Response: { conversations[], total, page }

GET /api/chat/conversations/:conversationId
  - Retrieve full conversation
  - Response: { conversationId, title, messages[], summary, createdAt, lastActivity }

GET /api/chat/conversations/:conversationId/messages
  - Retrieve conversation messages (paginated)
  - Query params: limit, offset, before, after
  - Response: { messages[], total, hasMore }

PATCH /api/chat/conversations/:conversationId
  - Update conversation metadata
  - Request: { title?, archived? }
  - Response: Updated conversation

DELETE /api/chat/conversations/:conversationId
  - Delete conversation
  - Response: { status, message }

POST /api/chat/conversations/:conversationId/summarize
  - Generate/update conversation summary
  - Response: { summary, title }
```

**Chat UI Features:**

1. **Conversation List**:
   - Display all user conversations with titles and timestamps
   - Show last message preview
   - Filter by patient, date, archived status
   - Search conversations by content

2. **Active Conversation**:
   - Real-time message streaming
   - Show agent reasoning (optional, for transparency)
   - Display tool calls and results (optional, for debugging)
   - Message citations with clickable document references
   - Typing indicators during agent processing

3. **Conversation Management**:
   - Auto-generate conversation titles from first few messages
   - Archive old conversations
   - Delete conversations with confirmation
   - Export conversation history

4. **Context Awareness**:
   - Show current patient context in UI
   - Display relevant documents in sidebar
   - Quick access to related conversations

#### FHIR API

**Endpoints (FHIR R4 Compliant):**
```
GET /fhir/Patient/:id
POST /fhir/Patient
PUT /fhir/Patient/:id
DELETE /fhir/Patient/:id
GET /fhir/Patient?name=:name&birthdate=:date

GET /fhir/Observation/:id
POST /fhir/Observation
GET /fhir/Observation?patient=:patientId&code=:code

GET /fhir/Condition/:id
POST /fhir/Condition
GET /fhir/Condition?patient=:patientId

GET /fhir/Medication/:id
POST /fhir/Medication
GET /fhir/Medication?patient=:patientId
```

#### Document API

**Endpoints:**
```
POST /api/documents/upload
  - Upload document file
  - Multipart form data with file and metadata
  - Response: { documentId, status, message }

GET /api/documents/:documentId
  - Retrieve document
  - Response: Document object

PUT /api/documents/:documentId
  - Update document
  - Request: Partial document updates
  - Response: Updated document

DELETE /api/documents/:documentId
  - Delete document
  - Response: { status, auditLogId }

GET /api/documents/patient/:patientId
  - List patient documents
  - Query params: type, dateRange, limit, offset
  - Response: { documents[], total, page }

POST /api/documents/search
  - Search documents
  - Request: { query, filters }
  - Response: { results[], total }
```

## Data Models

### Core Domain Models

**Document Model:**
```typescript
class Document {
  documentId: string;
  patientId: string;
  documentType: DocumentType;
  content: DocumentContent;
  metadata: DocumentMetadata;
  auditLog: AuditEntry[];
  
  encrypt(): void;
  decrypt(): void;
  validate(): ValidationResult;
  extractEntities(): MedicalEntity[];
}

enum DocumentType {
  FHIR = 'fhir',
  PDF = 'pdf',
  TEXT = 'text',
  MARKDOWN = 'markdown'
}

interface DocumentContent {
  raw?: Buffer;
  text?: string;
  fhirResource?: any;
  structuredData?: any;
}

interface DocumentMetadata {
  uploadTimestamp: Date;
  uploadMethod: 'naturalLanguage' | 'fileUpload';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  tags: string[];
  version: number;
  encryptionStatus: 'encrypted' | 'unencrypted';
}
```

**Patient Model:**
```typescript
class Patient {
  patientId: string;
  identifier: Identifier[];
  name: HumanName;
  gender: Gender;
  birthDate: Date;
  address: Address[];
  telecom: ContactPoint[];
  active: boolean;
  
  getAge(): number;
  getFullName(): string;
  getPrimaryContact(): ContactPoint;
}
```

**Search Result Model:**
```typescript
interface SearchResult {
  documentId: string;
  patientId: string;
  score: number;
  highlights: string[];
  document: Partial<Document>;
  metadata: {
    searchMethod: 'keyword' | 'semantic' | 'hybrid';
    matchedFields: string[];
  };
}
```

## Error Handling

### Error Categories

1. **Validation Errors** (400)
   - Invalid FHIR resources
   - Malformed requests
   - Missing required fields

2. **Authentication Errors** (401)
   - Invalid or expired tokens
   - Missing credentials

3. **Authorization Errors** (403)
   - Insufficient permissions
   - HIPAA access violations

4. **Not Found Errors** (404)
   - Document not found
   - Patient not found

5. **Processing Errors** (422)
   - PDF extraction failed
   - Entity extraction failed
   - Embedding generation failed

6. **System Errors** (500)
   - Database connection failures
   - OpenSearch unavailable
   - External service failures

### Error Response Format

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId: string;
  };
}
```

### Error Handling Strategy

1. **Graceful Degradation:**
   - If OpenSearch is unavailable, fall back to MongoDB text search
   - If embedding service fails, use keyword-only search
   - If entity extraction fails, store document without entities

2. **Retry Logic:**
   - Exponential backoff for transient failures
   - Maximum 3 retry attempts
   - Circuit breaker pattern for external services

3. **Logging and Monitoring:**
   - Log all errors with context
   - Alert on critical errors (data loss, security violations)
   - Track error rates and patterns

4. **User-Friendly Messages:**
   - Translate technical errors to user-friendly language
   - Provide actionable guidance when possible
   - Never expose sensitive system details

## Testing Strategy

### Unit Testing

**Coverage Targets:**
- Services: 80% code coverage
- Agents: 70% code coverage
- Utilities: 90% code coverage

**Key Test Areas:**
- FHIR validation logic
- Entity extraction accuracy
- Search ranking algorithms
- Encryption/decryption
- Agent intent classification

**Tools:**
- Jest for test framework
- Supertest for API testing
- MongoDB Memory Server for database tests

### Integration Testing

**Test Scenarios:**
- End-to-end document upload flow
- Natural language query to response
- Multi-agent workflows
- MongoDB-OpenSearch synchronization
- FHIR API compliance

**Tools:**
- Testcontainers for MongoDB and OpenSearch
- Mock LLM responses for deterministic tests

### Agent Testing

**Approach:**
- Test each agent independently with mocked dependencies
- Test supervisor agent routing logic
- Test conversation context management
- Validate agent responses against expected patterns
- Test reasoning and self-correction loops
- Test tool calling and evaluation
- Test memory persistence and retrieval

**Test Categories:**

1. **Reasoning Tests**:
   - Verify agent can break down complex tasks
   - Test decision-making logic
   - Validate reasoning chain coherence

2. **Tool Calling Tests**:
   - Test tool selection for given scenarios
   - Verify parameter extraction from context
   - Test tool result evaluation

3. **Self-Correction Tests**:
   - Test error recovery mechanisms
   - Verify retry logic with adjusted parameters
   - Test clarification request generation

4. **Memory Tests**:
   - Test short-term memory updates
   - Verify long-term memory persistence
   - Test context retrieval across sessions

5. **Multi-Agent Workflow Tests**:
   - Test supervisor routing to correct sub-agents
   - Verify context passing between agents
   - Test complex multi-step workflows

**Challenges:**
- LLM non-determinism: Use temperature=0 and seed for reproducibility
- Test with diverse input variations
- Validate semantic correctness, not exact string matching
- Mock LLM responses for deterministic unit tests
- Use real LLM for integration tests with acceptance criteria

**Example Test:**
```typescript
describe('QueryAgent Reasoning', () => {
  it('should refine search when initial results are insufficient', async () => {
    const agent = new QueryAgent();
    const context = {
      query: "What medications am I taking?",
      patientId: "patient-123"
    };
    
    // Mock initial search with poor results
    mockSearchTool.mockResolvedValueOnce({ results: [], total: 0 });
    
    // Mock refined search with good results
    mockSearchTool.mockResolvedValueOnce({ 
      results: [medication1, medication2], 
      total: 2 
    });
    
    const result = await agent.processQuery(context.query, context.patientId);
    
    // Verify agent refined the query
    expect(mockSearchTool).toHaveBeenCalledTimes(2);
    expect(result.reasoning).toContain('refined search');
    expect(result.answer).toContain('medication');
  });
});
```

### Security Testing

**Areas:**
- Authentication and authorization
- Encryption at rest and in transit
- SQL/NoSQL injection prevention
- HIPAA compliance validation
- Audit log integrity

**Tools:**
- OWASP ZAP for vulnerability scanning
- Custom HIPAA compliance checkers

### Performance Testing

**Metrics:**
- Document upload: < 5 seconds for 10MB PDF
- Search response: < 2 seconds
- Agent response: < 5 seconds (including reasoning and tool calls)
- Agent reasoning loop: < 10 iterations for 95% of queries
- Memory retrieval: < 100ms for working memory, < 500ms for conversation history
- Concurrent users: Support 100 simultaneous conversations

**Agent-Specific Performance Considerations:**

1. **Reasoning Overhead**:
   - Each reasoning step adds ~500ms-1s (LLM call)
   - Limit reasoning loops to 10 iterations max
   - Cache common reasoning patterns

2. **Tool Call Latency**:
   - Database queries: 50-200ms
   - Search queries: 100-500ms
   - Embedding generation: 200-500ms
   - Batch operations when possible

3. **Memory Access**:
   - Redis cache for hot working memory: < 10ms
   - MongoDB for conversation history: < 100ms
   - Implement pagination for large conversations

4. **Optimization Strategies**:
   - Parallel tool calls when independent
   - Stream responses to user during processing
   - Pre-compute embeddings for common queries
   - Cache LLM responses for identical inputs (with TTL)

**Tools:**
- k6 for load testing
- Artillery for stress testing
- Custom agent performance profiler to track reasoning steps

## Security and HIPAA Compliance

### Authentication and Authorization

**Implementation:**
- OAuth 2.0 with JWT tokens
- Role-based access control (RBAC)
- Roles: `patient`, `clinician`, `admin`
- Token expiration: 15 minutes (access), 7 days (refresh)
- Automatic session termination after 15 minutes inactivity

**Authorization Rules:**
- Patients can only access their own data
- Clinicians can access assigned patients
- Admins have full access with audit logging

### Encryption

**At Rest:**
- AES-256 encryption for all PHI in MongoDB
- Field-level encryption for sensitive fields
- Encryption keys stored in AWS KMS or HashiCorp Vault

**In Transit:**
- TLS 1.3 for all API communications
- Certificate pinning for mobile clients
- No fallback to older TLS versions

### Audit Logging

**Logged Events:**
- All document access (read, write, delete)
- Authentication attempts (success and failure)
- Authorization failures
- Data exports
- Configuration changes

**Audit Log Format:**
```typescript
interface AuditLog {
  eventId: string;
  timestamp: Date;
  userId: string;
  userRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress: string;
  userAgent: string;
  result: 'success' | 'failure';
  details?: any;
}
```

**Retention:**
- Audit logs retained for 7 years (HIPAA requirement)
- Stored in separate, append-only collection
- Regular integrity checks

### Data Isolation

**Strategy:**
- Partition MongoDB collections by patient ID
- OpenSearch index-level separation for multi-tenancy
- Query-level filters to prevent cross-patient data leakage
- Validate patient ID in every request

### Backup and Recovery

**Backup Strategy:**
- Daily automated backups of MongoDB
- Point-in-time recovery capability
- Encrypted backups stored in separate region
- Regular restore testing (monthly)

**Disaster Recovery:**
- RTO (Recovery Time Objective): 4 hours
- RPO (Recovery Point Objective): 1 hour
- Multi-region deployment for high availability

## Deployment Architecture

### Infrastructure

**Components:**
- **Application Servers:** Node.js on Kubernetes (3+ replicas)
- **Database:** MongoDB Atlas (replica set with 3 nodes)
- **Search:** Amazon OpenSearch Service (3-node cluster)
- **Load Balancer:** AWS ALB with SSL termination
- **Cache:** Redis for session and embedding cache
- **Storage:** S3 for document file storage (encrypted)

### Scalability

**Horizontal Scaling:**
- Stateless application servers (scale based on CPU/memory)
- MongoDB sharding by patient ID for large datasets
- OpenSearch cluster scaling for search load

**Vertical Scaling:**
- Increase MongoDB instance size for write-heavy workloads
- Larger OpenSearch nodes for complex queries

### Monitoring and Observability

**Metrics:**
- Application: Response times, error rates, throughput
- Database: Query performance, connection pool usage
- Search: Query latency, index size, cache hit rate
- Business: Documents uploaded, queries processed, active users
- Agent: Reasoning steps, tool calls, success rate, correction frequency

**Tools:**
- **LangSmith** for agent tracing, debugging, and evaluation
  - Trace every agent execution with full reasoning chain
  - Monitor tool call success rates
  - Evaluate agent performance with test datasets
  - Debug failed agent runs with full context
- **Prometheus** for metrics collection
- **Grafana** for dashboards
- **ELK stack** for log aggregation
- **Sentry** for error tracking

**LangSmith Integration:**
```typescript
import { Client } from "langsmith";

// Initialize LangSmith client
const langsmithClient = new Client({
  apiKey: process.env.LANGSMITH_API_KEY,
});

// Automatic tracing with environment variables
process.env.LANGCHAIN_TRACING_V2 = "true";
process.env.LANGCHAIN_PROJECT = "intelligent-medical-assistant";

// Custom run tracking
const runId = await langsmithClient.createRun({
  name: "query_agent_execution",
  run_type: "chain",
  inputs: { query: userQuery, patientId },
  project_name: "intelligent-medical-assistant"
});

// Track tool calls
await langsmithClient.createRun({
  name: "search_documents",
  run_type: "tool",
  inputs: { query, filters },
  parent_run_id: runId
});
```

**Agent-Specific Monitoring:**
- Track reasoning loop iterations per query
- Monitor tool call latency and success rates
- Measure self-correction frequency
- Track conversation length and context size
- Monitor memory usage (Redis + MongoDB)

**Alerts:**
- High error rate (> 5%)
- Slow response times (> 5 seconds)
- Agent reasoning loops exceeding 10 iterations
- High tool call failure rate (> 10%)
- Database connection failures
- Security events (unauthorized access attempts)
- Memory cache misses (> 30%)

## Future Enhancements

### Phase 2 Features

1. **Multi-Modal Support:**
   - Image analysis (X-rays, MRIs) using computer vision
   - Voice input/output for hands-free interaction
   - Video consultation integration

2. **Advanced Analytics:**
   - Predictive health insights
   - Population health analytics
   - Treatment outcome analysis

3. **Interoperability:**
   - HL7 v2 message support
   - Direct integration with EHR systems (Epic, Cerner)
   - Health Information Exchange (HIE) connectivity

4. **Enhanced Visualization:**
   - Timeline view of patient history
   - Interactive 3D anatomical models
   - Real-time vital signs dashboards

### Technical Debt and Improvements

1. **Performance Optimization:**
   - Implement caching layer for frequent queries
   - Optimize embedding generation with batch processing
   - Database query optimization and indexing

2. **Agent Improvements:**
   - Fine-tune LLM for medical domain
   - Implement specialized medical NER models
   - Add multi-turn conversation refinement

3. **Testing:**
   - Increase test coverage to 90%
   - Add end-to-end automated testing
   - Implement chaos engineering for resilience testing

4. **Documentation:**
   - API documentation with OpenAPI/Swagger
   - Developer onboarding guide
   - Architecture decision records (ADRs)
