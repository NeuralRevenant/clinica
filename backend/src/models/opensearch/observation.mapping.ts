export const OBSERVATION_INDEX = 'observations';

export const observationIndexMapping = {
  mappings: {
    properties: {
      observationId: { type: 'keyword' },
      patientId: { type: 'keyword' },
      patientName: { type: 'text' },
      observationCode: { type: 'keyword' },
      observationDisplay: { type: 'text' },
      valueString: { type: 'text' },
      valueQuantity: { type: 'float' },
      effectiveDate: { type: 'date' },
      category: { type: 'keyword' },
      embeddingVector: {
        type: 'knn_vector',
        dimension: 1536,
      },
    },
  },
  settings: {
    index: {
      'knn': true,
      'knn.algo_param.ef_search': 100,
    },
  },
};
