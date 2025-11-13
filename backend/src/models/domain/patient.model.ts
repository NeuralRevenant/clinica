import { 
  PatientDocument, 
  Identifier, 
  HumanName, 
  Address, 
  ContactPoint 
} from '../patient.schema.js';

export class Patient {
  private data: PatientDocument;

  constructor(data: PatientDocument) {
    this.data = data;
  }

  get patientId(): string {
    return this.data.patientId;
  }

  get identifier(): Identifier[] {
    return this.data.identifier;
  }

  get name(): HumanName {
    return this.data.name;
  }

  get gender(): 'male' | 'female' | 'other' | 'unknown' {
    return this.data.gender;
  }

  get birthDate(): Date {
    return this.data.birthDate;
  }

  get address(): Address[] {
    return this.data.address;
  }

  get telecom(): ContactPoint[] {
    return this.data.telecom;
  }

  get active(): boolean {
    return this.data.active;
  }

  getAge(): number {
    const today = new Date();
    const birthDate = new Date(this.data.birthDate);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }

  getFullName(): string {
    const { prefix = [], given, family, suffix = [] } = this.data.name;
    const parts = [
      ...prefix,
      ...given,
      family,
      ...suffix,
    ];
    return parts.filter(Boolean).join(' ');
  }

  getPrimaryContact(): ContactPoint | undefined {
    return this.data.telecom.find(t => t.use === 'home') || this.data.telecom[0];
  }

  validate(): ValidationResult {
    const errors: string[] = [];

    if (!this.data.patientId) {
      errors.push('Patient ID is required');
    }

    if (!this.data.name?.family) {
      errors.push('Family name is required');
    }

    if (!this.data.name?.given || this.data.name.given.length === 0) {
      errors.push('Given name is required');
    }

    if (!this.data.birthDate) {
      errors.push('Birth date is required');
    }

    if (!['male', 'female', 'other', 'unknown'].includes(this.data.gender)) {
      errors.push('Invalid gender value');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  toDocument(): PatientDocument {
    return { ...this.data };
  }

  static fromDocument(doc: PatientDocument): Patient {
    return new Patient(doc);
  }
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}
