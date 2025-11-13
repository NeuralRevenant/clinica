import { MedicalDocumentSchema, AuditEntry } from '../document.schema.js';
import { encrypt, decrypt } from '../../utils/encryption.js';

export enum DocumentType {
  FHIR = 'fhir',
  PDF = 'pdf',
  TEXT = 'text',
  MARKDOWN = 'markdown',
}

export interface DocumentContent {
  raw?: Buffer;
  text?: string;
  fhirResource?: any;
  structuredData?: any;
}

export interface DocumentMetadata {
  uploadTimestamp: Date;
  uploadMethod: 'naturalLanguage' | 'fileUpload';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  tags: string[];
  version: number;
  encryptionStatus: 'encrypted' | 'unencrypted';
}

export interface MedicalEntity {
  text: string;
  type: 'condition' | 'medication' | 'procedure' | 'observation';
  startOffset: number;
  endOffset: number;
  confidence: number;
  normalizedCode?: string;
}

export class Document {
  private data: MedicalDocumentSchema;

  constructor(data: MedicalDocumentSchema) {
    this.data = data;
  }

  get documentId(): string {
    return this.data.documentId;
  }

  get patientId(): string {
    return this.data.patientId;
  }

  get documentType(): DocumentType {
    return this.data.documentType as DocumentType;
  }

  get content(): DocumentContent {
    return {
      text: this.data.extractedText,
      fhirResource: this.data.fhirResource,
      structuredData: this.data.structuredData,
    };
  }

  get metadata(): DocumentMetadata {
    return {
      uploadTimestamp: this.data.uploadTimestamp,
      uploadMethod: this.data.uploadMethod,
      fileName: this.data.fileName,
      fileSize: this.data.fileSize,
      mimeType: this.data.mimeType,
      tags: this.data.tags,
      version: this.data.version,
      encryptionStatus: this.data.encryptionStatus,
    };
  }

  get auditLog(): AuditEntry[] {
    return this.data.auditLog;
  }

  async encrypt(encryptionKey: string): Promise<void> {
    if (this.data.encryptionStatus === 'encrypted') {
      return;
    }

    if (this.data.extractedText) {
      this.data.extractedText = await encrypt(this.data.extractedText, encryptionKey);
    }

    if (this.data.fhirResource) {
      const resourceStr = JSON.stringify(this.data.fhirResource);
      this.data.fhirResource = await encrypt(resourceStr, encryptionKey);
    }

    this.data.encryptionStatus = 'encrypted';
  }

  async decrypt(encryptionKey: string): Promise<void> {
    if (this.data.encryptionStatus === 'unencrypted') {
      return;
    }

    if (this.data.extractedText) {
      this.data.extractedText = await decrypt(this.data.extractedText, encryptionKey);
    }

    if (this.data.fhirResource && typeof this.data.fhirResource === 'string') {
      const decryptedStr = await decrypt(this.data.fhirResource, encryptionKey);
      this.data.fhirResource = JSON.parse(decryptedStr);
    }

    this.data.encryptionStatus = 'unencrypted';
  }

  validate(): ValidationResult {
    const errors: string[] = [];

    if (!this.data.documentId) {
      errors.push('Document ID is required');
    }

    if (!this.data.patientId) {
      errors.push('Patient ID is required');
    }

    if (!this.data.documentType) {
      errors.push('Document type is required');
    }

    if (!['fhir', 'pdf', 'text', 'markdown'].includes(this.data.documentType)) {
      errors.push('Invalid document type');
    }

    if (this.data.documentType === 'fhir' && !this.data.fhirResource) {
      errors.push('FHIR resource is required for FHIR documents');
    }

    if (!this.data.uploadTimestamp) {
      errors.push('Upload timestamp is required');
    }

    if (!['naturalLanguage', 'fileUpload'].includes(this.data.uploadMethod)) {
      errors.push('Invalid upload method');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  extractEntities(): MedicalEntity[] {
    // Placeholder for entity extraction logic
    // This will be implemented in the Entity Extraction Service
    return [];
  }

  addAuditEntry(entry: AuditEntry): void {
    this.data.auditLog.push(entry);
    this.data.lastModified = new Date();
  }

  toDocument(): MedicalDocumentSchema {
    return { ...this.data };
  }

  static fromDocument(doc: MedicalDocumentSchema): Document {
    return new Document(doc);
  }
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}
