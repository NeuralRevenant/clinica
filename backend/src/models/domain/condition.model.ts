import { ConditionDocument } from '../condition.schema.js';
import { CodeableConcept } from '../observation.schema.js';

export class Condition {
  private data: ConditionDocument;

  constructor(data: ConditionDocument) {
    this.data = data;
  }

  get conditionId(): string {
    return this.data.conditionId;
  }

  get patientId(): string {
    return this.data.patientId;
  }

  get code(): CodeableConcept {
    return this.data.code;
  }

  get clinicalStatus(): string {
    return this.data.clinicalStatus;
  }

  get verificationStatus(): string {
    return this.data.verificationStatus;
  }

  get severity(): string | undefined {
    return this.data.severity;
  }

  get onsetDateTime(): Date | undefined {
    return this.data.onsetDateTime;
  }

  get recordedDate(): Date {
    return this.data.recordedDate;
  }

  getCodeDisplay(): string {
    return this.data.code.coding[0]?.display || 'Unknown';
  }

  isActive(): boolean {
    return this.data.clinicalStatus === 'active';
  }

  getDuration(): number | null {
    if (!this.data.onsetDateTime) {
      return null;
    }

    const endDate = this.data.abatementDateTime || new Date();
    const startDate = new Date(this.data.onsetDateTime);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }

  validate(): ValidationResult {
    const errors: string[] = [];

    if (!this.data.conditionId) {
      errors.push('Condition ID is required');
    }

    if (!this.data.patientId) {
      errors.push('Patient ID is required');
    }

    if (!this.data.code || !this.data.code.coding || this.data.code.coding.length === 0) {
      errors.push('Condition code is required');
    }

    if (!this.data.clinicalStatus) {
      errors.push('Clinical status is required');
    }

    if (!this.data.verificationStatus) {
      errors.push('Verification status is required');
    }

    if (!this.data.recordedDate) {
      errors.push('Recorded date is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  toDocument(): ConditionDocument {
    return { ...this.data };
  }

  static fromDocument(doc: ConditionDocument): Condition {
    return new Condition(doc);
  }
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}
