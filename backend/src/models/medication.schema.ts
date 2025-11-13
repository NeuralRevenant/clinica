import { ObjectId } from 'mongodb';
import { CodeableConcept } from './common-types.js';

export interface Dosage {
  text: string;
  route?: string;
  doseQuantity?: {
    value: number;
    unit: string;
  };
  timing?: any;
}

export interface EffectivePeriod {
  start: Date;
  end?: Date;
}

export interface MedicationDocument {
  _id?: ObjectId;
  medicationId: string;
  patientId: string;
  code: CodeableConcept;
  status: string;
  dosage: Dosage;
  effectivePeriod?: EffectivePeriod;
  dateAsserted: Date;
  informationSource?: string;
  reasonCode?: string[];
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MEDICATION_COLLECTION = 'medications';
