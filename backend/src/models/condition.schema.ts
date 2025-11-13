import { ObjectId } from 'mongodb';
import { CodeableConcept } from './common-types.js';

export interface ConditionDocument {
  _id?: ObjectId;
  conditionId: string;
  patientId: string;
  code: CodeableConcept;
  clinicalStatus: string;
  verificationStatus: string;
  severity?: string;
  onsetDateTime?: Date;
  abatementDateTime?: Date;
  recordedDate: Date;
  recorder?: string;
  asserter?: string;
  stage?: any;
  evidence?: any[];
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const CONDITION_COLLECTION = 'conditions';
