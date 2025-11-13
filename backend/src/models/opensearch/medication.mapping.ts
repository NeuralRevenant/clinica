export const MEDICATION_INDEX = 'medications';

export const medicationIndexMapping = {
  mappings: {
    properties: {
      medicationId: { type: 'keyword' },
      patientId: { type: 'keyword' },
      patientName: { type: 'text' },
      medicationCode: { type: 'keyword' },
      medicationDisplay: { type: 'text' },
      dosageText: { type: 'text' },
      status: { type: 'keyword' },
      effectivePeriod: { type: 'date_range' },
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
