/**
 * Supervisor Agent Usage Examples
 * 
 * This file demonstrates how to use the Supervisor Agent
 * in various scenarios.
 */

import { SupervisorAgent } from './supervisor.agent.js';
import { UploadAgent } from './upload.agent.js';
import { QueryAgent } from './query.agent.js';
import { EditAgent } from './edit.agent.js';
import { DeleteAgent } from './delete.agent.js';
import { VisualizationAgent } from './visualization.agent.js';
import { MemoryService } from '../service/memory.service.js';
import { DocumentService } from '../service/document.service.js';
import { SearchService } from '../service/search.service.js';
import { FHIRService } from '../service/fhir.service.js';
import { EmbeddingService } from '../service/embedding.service.js';
import { EntityExtractionService } from '../service/entity-extraction.service.js';
import { GraphService } from '../service/graph.service.js';

/**
 * Example 1: Initialize Supervisor Agent
 */
async function initializeSupervisor(
  db: any,
  redis: any,
  opensearch: any,
  openaiApiKey: string
): Promise<SupervisorAgent> {
  // Initialize services
  const memoryService = new MemoryService(db, redis, openaiApiKey);
  const documentService = new DocumentService(db, openaiApiKey);
  const searchService = new SearchService(opensearch, db);
  const fhirService = new FHIRService();
  const embeddingService = new EmbeddingService(openaiApiKey);
  const entityExtractionService = new EntityExtractionService(openaiApiKey);
  const graphService = new GraphService(db, entityExtractionService);

  // Initialize specialized agents
  const uploadAgent = new UploadAgent({
    documentService,
    fhirService,
    entityExtractionService,
    embeddingService,
    searchService,
    openaiApiKey,
  });

  const queryAgent = new QueryAgent({
    searchService,
    embeddingService,
    documentService,
    openaiApiKey,
  });

  const editAgent = new EditAgent({
    documentService,
    fhirService,
    searchService,
    embeddingService,
    openaiApiKey,
  });

  const deleteAgent = new DeleteAgent({
    documentService,
    searchService,
    openaiApiKey,
  });

  const visualizationAgent = new VisualizationAgent({
    graphService,
    searchService,
    entityExtractionService,
    openaiApiKey,
  });

  // Create supervisor agent
  const supervisor = new SupervisorAgent({
    memoryService,
    uploadAgent,
    queryAgent,
    editAgent,
    deleteAgent,
    visualizationAgent,
    openaiApiKey,
    model: 'gpt-4',
    temperature: 0.2,
  });

  return supervisor;
}

/**
 * Example 2: Basic Conversation
 */
async function basicConversationExample(supervisor: SupervisorAgent) {
  const userId = 'user_123';
  const patientId = 'patient_456';
  const conversationId = `conv_${Date.now()}`;

  console.log('=== Basic Conversation Example ===\n');

  // Greeting
  const greeting = await supervisor.processUserInput(
    "Hello, I need help with my medical records",
    conversationId,
    userId
  );
  console.log('User: Hello, I need help with my medical records');
  console.log(`Assistant: ${greeting.message}`);
  console.log(`Intent: ${greeting.intent}\n`);

  // Query
  const query = await supervisor.processUserInput(
    "What medications am I currently taking?",
    conversationId,
    userId,
    patientId
  );
  console.log('User: What medications am I currently taking?');
  console.log(`Assistant: ${query.message}`);
  console.log(`Intent: ${query.intent}`);
  console.log(`Sub-Agent: ${query.subAgentUsed}\n`);
}

/**
 * Example 3: Document Upload Workflow
 */
async function uploadWorkflowExample(supervisor: SupervisorAgent) {
  const userId = 'user_123';
  const patientId = 'patient_456';
  const conversationId = `conv_${Date.now()}`;

  console.log('=== Document Upload Workflow ===\n');

  // Upload request
  const upload = await supervisor.processUserInput(
    `I want to upload my recent lab results. Here's the data:
    
    Hemoglobin: 14.2 g/dL
    White Blood Cell Count: 7500 cells/μL
    Platelet Count: 250,000 cells/μL
    Date: 2024-01-15`,
    conversationId,
    userId,
    patientId
  );

  console.log('User: I want to upload my recent lab results...');
  console.log(`Assistant: ${upload.message}`);
  console.log(`Success: ${upload.success}`);
  console.log(`Intent: ${upload.intent}`);
  console.log(`Document ID: ${upload.data?.documentId || 'N/A'}\n`);
}

/**
 * Example 4: Multi-Step Query with Clarification
 */
async function multiStepQueryExample(supervisor: SupervisorAgent) {
  const userId = 'user_123';
  const patientId = 'patient_456';
  const conversationId = `conv_${Date.now()}`;

  console.log('=== Multi-Step Query with Clarification ===\n');

  // Ambiguous query
  const query1 = await supervisor.processUserInput(
    "Show me my test results",
    conversationId,
    userId,
    patientId
  );
  console.log('User: Show me my test results');
  console.log(`Assistant: ${query1.message}`);
  console.log(`Requires Follow-up: ${query1.requiresFollowUp}\n`);

  // Clarification
  if (query1.requiresFollowUp) {
    const query2 = await supervisor.processUserInput(
      "The blood test from last month",
      conversationId,
      userId,
      patientId
    );
    console.log('User: The blood test from last month');
    console.log(`Assistant: ${query2.message}`);
    console.log(`Success: ${query2.success}\n`);
  }
}

/**
 * Example 5: Edit Document Workflow
 */
async function editWorkflowExample(supervisor: SupervisorAgent) {
  const userId = 'user_123';
  const patientId = 'patient_456';
  const conversationId = `conv_${Date.now()}`;

  console.log('=== Edit Document Workflow ===\n');

  // Edit request
  const edit = await supervisor.processUserInput(
    "Update my blood pressure medication dosage to 20mg",
    conversationId,
    userId,
    patientId
  );

  console.log('User: Update my blood pressure medication dosage to 20mg');
  console.log(`Assistant: ${edit.message}`);
  console.log(`Success: ${edit.success}`);
  console.log(`Requires Confirmation: ${edit.data?.requiresConfirmation || false}\n`);

  // If confirmation required
  if (edit.data?.requiresConfirmation) {
    const confirm = await supervisor.processUserInput(
      "Yes, please proceed with the update",
      conversationId,
      userId,
      patientId
    );
    console.log('User: Yes, please proceed with the update');
    console.log(`Assistant: ${confirm.message}`);
    console.log(`Success: ${confirm.success}\n`);
  }
}

/**
 * Example 6: Visualization Request
 */
async function visualizationExample(supervisor: SupervisorAgent) {
  const userId = 'user_123';
  const patientId = 'patient_456';
  const conversationId = `conv_${Date.now()}`;

  console.log('=== Visualization Request ===\n');

  const viz = await supervisor.processUserInput(
    "Show me a graph of how my diabetes medications relate to my conditions",
    conversationId,
    userId,
    patientId
  );

  console.log('User: Show me a graph of how my diabetes medications relate to my conditions');
  console.log(`Assistant: ${viz.message}`);
  console.log(`Success: ${viz.success}`);
  console.log(`Intent: ${viz.intent}`);
  console.log(`Graph Data Available: ${!!viz.data?.graph}\n`);
}

/**
 * Example 7: Delete Document Workflow
 */
async function deleteWorkflowExample(supervisor: SupervisorAgent) {
  const userId = 'user_123';
  const patientId = 'patient_456';
  const conversationId = `conv_${Date.now()}`;

  console.log('=== Delete Document Workflow ===\n');

  const deleteReq = await supervisor.processUserInput(
    "Delete my old lab results from 2020",
    conversationId,
    userId,
    patientId
  );

  console.log('User: Delete my old lab results from 2020');
  console.log(`Assistant: ${deleteReq.message}`);
  console.log(`Success: ${deleteReq.success}`);
  console.log(`Requires Confirmation: ${deleteReq.data?.requiresConfirmation || false}\n`);
}

/**
 * Example 8: Handling Missing Patient ID
 */
async function missingPatientIdExample(supervisor: SupervisorAgent) {
  const userId = 'user_123';
  const conversationId = `conv_${Date.now()}`;

  console.log('=== Handling Missing Patient ID ===\n');

  // Query without patient ID
  const query = await supervisor.processUserInput(
    "What medications am I taking?",
    conversationId,
    userId
    // No patientId provided
  );

  console.log('User: What medications am I taking?');
  console.log(`Assistant: ${query.message}`);
  console.log(`Success: ${query.success}`);
  console.log(`Requires Follow-up: ${query.requiresFollowUp}\n`);

  // Provide patient ID
  const retry = await supervisor.processUserInput(
    "My patient ID is patient_456",
    conversationId,
    userId,
    'patient_456'
  );

  console.log('User: My patient ID is patient_456');
  console.log(`Assistant: ${retry.message}`);
  console.log(`Success: ${retry.success}\n`);
}

/**
 * Example 9: Context Maintenance Across Messages
 */
async function contextMaintenanceExample(supervisor: SupervisorAgent) {
  const userId = 'user_123';
  const patientId = 'patient_456';
  const conversationId = `conv_${Date.now()}`;

  console.log('=== Context Maintenance Example ===\n');

  // First message
  const msg1 = await supervisor.processUserInput(
    "Upload my cholesterol test results: Total 220 mg/dL, LDL 140 mg/dL, HDL 45 mg/dL",
    conversationId,
    userId,
    patientId
  );
  console.log('User: Upload my cholesterol test results...');
  console.log(`Assistant: ${msg1.message}\n`);

  // Second message - references previous context
  const msg2 = await supervisor.processUserInput(
    "What were the LDL levels?",
    conversationId,
    userId,
    patientId
  );
  console.log('User: What were the LDL levels?');
  console.log(`Assistant: ${msg2.message}\n`);

  // Third message - continues context
  const msg3 = await supervisor.processUserInput(
    "Is that level concerning?",
    conversationId,
    userId,
    patientId
  );
  console.log('User: Is that level concerning?');
  console.log(`Assistant: ${msg3.message}\n`);
}

/**
 * Example 10: Error Handling
 */
async function errorHandlingExample(supervisor: SupervisorAgent) {
  const userId = 'user_123';
  const patientId = 'patient_456';
  const conversationId = `conv_${Date.now()}`;

  console.log('=== Error Handling Example ===\n');

  try {
    // Invalid request
    const response = await supervisor.processUserInput(
      "Delete document with ID that doesn't exist: doc_invalid_123",
      conversationId,
      userId,
      patientId
    );

    console.log('User: Delete document with ID that doesn\'t exist...');
    console.log(`Assistant: ${response.message}`);
    console.log(`Success: ${response.success}`);
    console.log(`Requires Follow-up: ${response.requiresFollowUp}\n`);
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

/**
 * Example 11: Monitoring and Debugging
 */
async function monitoringExample(supervisor: SupervisorAgent) {
  const userId = 'user_123';
  const patientId = 'patient_456';
  const conversationId = `conv_${Date.now()}`;

  console.log('=== Monitoring and Debugging ===\n');

  const response = await supervisor.processUserInput(
    "Find all my documents related to diabetes",
    conversationId,
    userId,
    patientId
  );

  // Log detailed information for monitoring
  console.log('User Input: Find all my documents related to diabetes');
  console.log('\n--- Response Details ---');
  console.log(`Success: ${response.success}`);
  console.log(`Intent: ${response.intent}`);
  console.log(`Sub-Agent Used: ${response.subAgentUsed}`);
  console.log(`Action: ${response.action}`);
  console.log(`Requires Follow-up: ${response.requiresFollowUp}`);
  console.log('\n--- Reasoning ---');
  console.log(response.reasoning);
  console.log('\n--- Tool Calls ---');
  console.log(JSON.stringify(response.toolCalls, null, 2));
  console.log('\n--- Final Message ---');
  console.log(response.message);
  console.log();
}

/**
 * Main function to run all examples
 */
async function runExamples() {
  // Note: This requires actual database connections
  // In production, initialize with real db, redis, opensearch instances
  
  console.log('Supervisor Agent Usage Examples');
  console.log('================================\n');
  console.log('Note: These examples require actual service connections.');
  console.log('See the code for implementation details.\n');

  // Uncomment to run with real connections:
  /*
  const supervisor = await initializeSupervisor(
    db,
    redis,
    opensearch,
    process.env.OPENAI_API_KEY!
  );

  await basicConversationExample(supervisor);
  await uploadWorkflowExample(supervisor);
  await multiStepQueryExample(supervisor);
  await editWorkflowExample(supervisor);
  await visualizationExample(supervisor);
  await deleteWorkflowExample(supervisor);
  await missingPatientIdExample(supervisor);
  await contextMaintenanceExample(supervisor);
  await errorHandlingExample(supervisor);
  await monitoringExample(supervisor);
  */
}

// Export examples for use in tests or documentation
export {
  initializeSupervisor,
  basicConversationExample,
  uploadWorkflowExample,
  multiStepQueryExample,
  editWorkflowExample,
  visualizationExample,
  deleteWorkflowExample,
  missingPatientIdExample,
  contextMaintenanceExample,
  errorHandlingExample,
  monitoringExample,
  runExamples,
};

// Run examples if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}
