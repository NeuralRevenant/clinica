export const CONDITION_INDEX = 'conditions';

export const conditionIndexMapping = {
  mappings: {
    properties: {
      conditionId: { type: 'keyword' },
      patientId: { type: 'keyword' },
      patientName: { type: 'text' },
      conditionCode: { type: 'keyword' },
      conditionDisplay: { type: 'text' },
      clinicalStatus: { type: 'keyword' },
      severity: { type: 'keyword' },
      onsetDate: { type: 'date' },
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
