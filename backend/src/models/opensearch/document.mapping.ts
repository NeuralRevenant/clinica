export const DOCUMENT_INDEX = 'documents';

export const documentIndexMapping = {
  mappings: {
    properties: {
      documentId: { type: 'keyword' },
      patientId: { type: 'keyword' },
      patientName: { type: 'text' },
      documentType: { type: 'keyword' },
      fhirResourceType: { type: 'keyword' },
      extractedText: { 
        type: 'text',
        analyzer: 'standard',
      },
      medicalEntities: {
        properties: {
          conditions: { type: 'text' },
          medications: { type: 'text' },
          procedures: { type: 'text' },
          observations: { type: 'text' },
        },
      },
      embeddingVector: {
        type: 'knn_vector',
        dimension: 1536,
      },
      uploadTimestamp: { type: 'date' },
      uploadMethod: { type: 'keyword' },
      fileName: { type: 'text' },
      tags: { type: 'keyword' },
      keywords: { type: 'text' },
    },
  },
  settings: {
    index: {
      'knn': true,
      'knn.algo_param.ef_search': 100,
    },
    analysis: {
      analyzer: {
        medical_analyzer: {
          type: 'standard',
          stopwords: '_english_',
        },
      },
    },
  },
};
