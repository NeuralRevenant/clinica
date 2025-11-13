import { ObjectId } from 'mongodb';

export interface AuditEntry {
  action: 'create' | 'update' | 'delete' | 'access';
  userId: string;
  timestamp: Date;
  changes?: any;
}

export interface MedicalDocumentSchema {
  _id?: ObjectId;
  documentId: string;
  patientId: string;
  documentType: 'fhir' | 'pdf' | 'text' | 'markdown';
  fhirResourceType?: string;
  fhirResource?: any;
  uploadTimestamp: Date;
  uploadMethod: 'naturalLanguage' | 'fileUpload';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  extractedText?: string;
  structuredData?: any;
  metadata: Record<string, any>;
  tags: string[];
  encryptionStatus: 'encrypted' | 'unencrypted';
  lastModified: Date;
  modifiedBy: string;
  version: number;
  auditLog: AuditEntry[];
}

export const DOCUMENT_COLLECTION = 'documents';
