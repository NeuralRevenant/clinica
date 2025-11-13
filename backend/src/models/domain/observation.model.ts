import { ObservationDocument, CodeableConcept, ObservationValue } from '../observation.schema.js';

export class Observation {
  private data: ObservationDocument;

  constructor(data: ObservationDocument) {
    this.data = data;
  }

  get observationId(): string {
    return this.data.observationId;
  }

  get patientId(): string {
    return this.data.patientId;
  }

  get code(): CodeableConcept {
    return this.data.code;
  }

  get value(): ObservationValue {
    return this.data.value;
  }

  get effectiveDateTime(): Date {
    return this.data.effectiveDateTime;
  }

  get status(): string {
    return this.data.status;
  }

  get category(): string[] {
    return this.data.category;
  }

  getDisplayValue(): string {
    if (this.data.value.quantity) {
      return `${this.data.value.quantity.value} ${this.data.value.quantity.unit}`;
    }
    if (this.data.value.string) {
      return this.data.value.string;
    }
    if (this.data.value.boolean !== undefined) {
      return this.data.value.boolean.toString();
    }
    return 'N/A';
  }

  getCodeDisplay(): string {
    return this.data.code.coding[0]?.display || 'Unknown';
  }

  validate(): ValidationResult {
    const errors: string[] = [];

    if (!this.data.observationId) {
      errors.push('Observation ID is required');
    }

    if (!this.data.patientId) {
      errors.push('Patient ID is required');
    }

    if (!this.data.code || !this.data.code.coding || this.data.code.coding.length === 0) {
      errors.push('Observation code is required');
    }

    if (!this.data.value || 
        (!this.data.value.quantity && !this.data.value.string && this.data.value.boolean === undefined)) {
      errors.push('Observation value is required');
    }

    if (!this.data.effectiveDateTime) {
      errors.push('Effective date/time is required');
    }

    if (!this.data.status) {
      errors.push('Status is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  toDocument(): ObservationDocument {
    return { ...this.data };
  }

  static fromDocument(doc: ObservationDocument): Observation {
    return new Observation(doc);
  }
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}
