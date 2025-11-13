export const PATIENT_INDEX = 'patients';

export const patientIndexMapping = {
  mappings: {
    properties: {
      patientId: { type: 'keyword' },
      fullName: { type: 'text' },
      familyName: { type: 'text' },
      givenName: { type: 'text' },
      gender: { type: 'keyword' },
      birthDate: { type: 'date' },
      age: { type: 'integer' },
      city: { type: 'text' },
      state: { type: 'keyword' },
      postalCode: { type: 'keyword' },
      phone: { type: 'keyword' },
      email: { type: 'keyword' },
      active: { type: 'boolean' },
      identifierValues: { type: 'text' },
      embeddingVector: {
        type: 'knn_vector',
        dimension: 1536,
      },
      lastUpdated: { type: 'date' },
    },
  },
  settings: {
    index: {
      'knn': true,
      'knn.algo_param.ef_search': 100,
    },
  },
};
