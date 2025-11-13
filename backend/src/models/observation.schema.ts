import { ObjectId } from 'mongodb';
import { CodeableConcept } from './common-types.js';

export interface ObservationValue {
  quantity?: {
    value: number;
    unit: string;
  };
  string?: string;
  boolean?: boolean;
}

export interface ReferenceRange {
  low: number;
  high: number;
  type: string;
}

export interface ObservationDocument {
  _id?: ObjectId;
  observationId: string;
  patientId: string;
  code: CodeableConcept;
  value: ObservationValue;
  effectiveDateTime: Date;
  issued: Date;
  performer: string[];
  interpretation?: string;
  bodySite?: string;
  method?: string;
  referenceRange?: ReferenceRange[];
  category: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export const OBSERVATION_COLLECTION = 'observations';
