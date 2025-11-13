import { MedicationDocument, Dosage } from '../medication.schema.js';
import { CodeableConcept } from '../observation.schema.js';

export class Medication {
  private data: MedicationDocument;

  constructor(data: MedicationDocument) {
    this.data = data;
  }

  get medicationId(): string {
    return this.data.medicationId;
  }

  get patientId(): string {
    return this.data.patientId;
  }

  get code(): CodeableConcept {
    return this.data.code;
  }

  get status(): string {
    return this.data.status;
  }

  get dosage(): Dosage {
    return this.data.dosage;
  }

  get dateAsserted(): Date {
    return this.data.dateAsserted;
  }

  getCodeDisplay(): string {
    return this.data.code.coding[0]?.display || 'Unknown';
  }

  getDosageText(): string {
    return this.data.dosage.text;
  }

  isActive(): boolean {
    if (this.data.status !== 'active') {
      return false;
    }

    if (this.data.effectivePeriod?.end) {
      return new Date(this.data.effectivePeriod.end) > new Date();
    }

    return true;
  }

  getDurationDays(): number | null {
    if (!this.data.effectivePeriod) {
      return null;
    }

    const startDate = new Date(this.data.effectivePeriod.start);
    const endDate = this.data.effectivePeriod.end 
      ? new Date(this.data.effectivePeriod.end) 
      : new Date();

    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }

  validate(): ValidationResult {
    const errors: string[] = [];

    if (!this.data.medicationId) {
      errors.push('Medication ID is required');
    }

    if (!this.data.patientId) {
      errors.push('Patient ID is required');
    }

    if (!this.data.code || !this.data.code.coding || this.data.code.coding.length === 0) {
      errors.push('Medication code is required');
    }

    if (!this.data.status) {
      errors.push('Status is required');
    }

    if (!this.data.dosage || !this.data.dosage.text) {
      errors.push('Dosage information is required');
    }

    if (!this.data.dateAsserted) {
      errors.push('Date asserted is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  toDocument(): MedicationDocument {
    return { ...this.data };
  }

  static fromDocument(doc: MedicationDocument): Medication {
    return new Medication(doc);
  }
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}
