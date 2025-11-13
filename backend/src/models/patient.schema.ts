import { ObjectId } from 'mongodb';

export interface Identifier {
  system: string;
  value: string;
}

export interface HumanName {
  family: string;
  given: string[];
  prefix?: string[];
  suffix?: string[];
}

export interface Address {
  line: string[];
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface ContactPoint {
  system: 'phone' | 'email' | 'fax';
  value: string;
  use: 'home' | 'work' | 'mobile';
}

export interface Communication {
  language: string;
  preferred: boolean;
}

export interface Contact {
  relationship: string;
  name: HumanName;
  telecom: ContactPoint[];
  address: Address;
}

export interface PatientDocument {
  _id?: ObjectId;
  patientId: string;
  identifier: Identifier[];
  name: HumanName;
  gender: 'male' | 'female' | 'other' | 'unknown';
  birthDate: Date;
  address: Address[];
  telecom: ContactPoint[];
  maritalStatus?: string;
  communication: Communication[];
  generalPractitioner?: string[];
  managingOrganization?: string;
  active: boolean;
  deceasedBoolean?: boolean;
  deceasedDateTime?: Date;
  multipleBirthBoolean?: boolean;
  photo?: string[];
  contact: Contact[];
  encryptionStatus: 'encrypted' | 'unencrypted';
  createdAt: Date;
  updatedAt: Date;
}

export const PATIENT_COLLECTION = 'patients';
