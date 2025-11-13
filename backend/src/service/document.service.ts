import { Collection, Db, ObjectId } from 'mongodb';
import { getEncryptionService, EncryptionService } from '../utils/encryption.js';

export interface CreateDocumentDTO {
  patientId: string;
  documentType: 'fhir' | 'pdf' | 'text' | 'markdown';
  fhirResourceType?: string;
  fhirResource?: any;
  uploadMethod: 'naturalLanguage' | 'fileUpload';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  extractedText?: string;
  structuredData?: any;
  metadata?: Record<string, any>;
  tags?: string[];
  userId: string;
}

export interface UpdateDocumentDTO {
  fhirResource?: any;
  extractedText?: string;
  structuredData?: any;
  metadata?: Record<string, any>;
  tags?: string[];
  userId: string;
}

export interface DocumentFilters {
  documentType?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface MedicalDocument {
  _id: ObjectId;
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

export interface AuditEntry {
  action: 'create' | 'update' | 'delete' | 'access';
  userId: string;
  timestamp: Date;
  changes?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Document Service - Handles CRUD operations for medical documents
 * Implements encryption/decryption for PHI, validation, and audit logging
 */
export class DocumentService {
  private collection: Collection<MedicalDocument>;
  private encryptionService: EncryptionService;
  private readonly PHI_FIELDS = ['extractedText', 'fhirResource', 'structuredData'];

  constructor(db: Db) {
    this.collection = db.collection<MedicalDocument>('documents');
    this.encryptionService = getEncryptionService();
  }

  /**
   * Create a new document
   */
  async createDocument(dto: CreateDocumentDTO): Promise<MedicalDocument> {
    const documentId = this.generateDocumentId();
    const now = new Date();

    // Validate document
    const validation = this.validateDocument(dto);
    if (!validation.isValid) {
      throw new Error(`Document validation failed: ${validation.errors.join(', ')}`);
    }

    // Prepare document
    const document: MedicalDocument = {
      _id: new ObjectId(),
      documentId,
      patientId: dto.patientId,
      documentType: dto.documentType,
      fhirResourceType: dto.fhirResourceType,
      fhirResource: dto.fhirResource,
      uploadTimestamp: now,
      uploadMethod: dto.uploadMethod,
      fileName: dto.fileName,
      fileSize: dto.fileSize,
      mimeType: dto.mimeType,
      extractedText: dto.extractedText,
      structuredData: dto.structuredData,
      metadata: dto.metadata || {},
      tags: dto.tags || [],
      encryptionStatus: 'unencrypted',
      lastModified: now,
      modifiedBy: dto.userId,
      version: 1,
      auditLog: [
        {
          action: 'create',
          userId: dto.userId,
          timestamp: now,
        },
      ],
    };

    // Encrypt PHI fields
    const encryptedDocument = this.encryptDocument(document);

    // Insert into database
    await this.collection.insertOne(encryptedDocument);

    return encryptedDocument;
  }

  /**
   * Get document by ID
   */
  async getDocument(documentId: string, userId: string): Promise<MedicalDocument | null> {
    const document = await this.collection.findOne({ documentId });

    if (!document) {
      return null;
    }

    // Add audit log entry for access
    await this.addAuditEntry(documentId, {
      action: 'access',
      userId,
      timestamp: new Date(),
    });

    // Decrypt PHI fields
    return this.decryptDocument(document);
  }

  /**
   * Update document
   */
  async updateDocument(
    documentId: string,
    updates: UpdateDocumentDTO
  ): Promise<MedicalDocument | null> {
    const existingDoc = await this.collection.findOne({ documentId });

    if (!existingDoc) {
      return null;
    }

    const now = new Date();

    // Prepare updates
    const updateData: Partial<MedicalDocument> = {
      lastModified: now,
      modifiedBy: updates.userId,
      version: existingDoc.version + 1,
    };

    // Track changes for audit log
    const changes: Record<string, any> = {};

    if (updates.fhirResource !== undefined) {
      updateData.fhirResource = updates.fhirResource;
      changes.fhirResource = 'updated';
    }

    if (updates.extractedText !== undefined) {
      updateData.extractedText = updates.extractedText;
      changes.extractedText = 'updated';
    }

    if (updates.structuredData !== undefined) {
      updateData.structuredData = updates.structuredData;
      changes.structuredData = 'updated';
    }

    if (updates.metadata !== undefined) {
      updateData.metadata = { ...existingDoc.metadata, ...updates.metadata };
      changes.metadata = updates.metadata;
    }

    if (updates.tags !== undefined) {
      updateData.tags = updates.tags;
      changes.tags = updates.tags;
    }

    // Encrypt updated PHI fields
    const encryptedUpdates = this.encryptDocumentFields(updateData);

    // Update document
    const result = await this.collection.findOneAndUpdate(
      { documentId },
      {
        $set: encryptedUpdates,
        $push: {
          auditLog: {
            action: 'update',
            userId: updates.userId,
            timestamp: now,
            changes,
          },
        },
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return null;
    }

    return this.decryptDocument(result);
  }

  /**
   * Delete document
   */
  async deleteDocument(documentId: string, userId: string): Promise<boolean> {
    const document = await this.collection.findOne({ documentId });

    if (!document) {
      return false;
    }

    // Add audit log entry before deletion
    await this.addAuditEntry(documentId, {
      action: 'delete',
      userId,
      timestamp: new Date(),
    });

    // Delete document
    const result = await this.collection.deleteOne({ documentId });

    return result.deletedCount > 0;
  }

  /**
   * List documents for a patient
   */
  async listDocuments(
    patientId: string,
    filters: DocumentFilters = {}
  ): Promise<MedicalDocument[]> {
    const query: any = { patientId };

    // Apply filters
    if (filters.documentType) {
      query.documentType = filters.documentType;
    }

    if (filters.dateRange) {
      query.uploadTimestamp = {
        $gte: filters.dateRange.start,
        $lte: filters.dateRange.end,
      };
    }

    if (filters.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags };
    }

    // Execute query with pagination
    const documents = await this.collection
      .find(query)
      .sort({ uploadTimestamp: -1 })
      .skip(filters.offset || 0)
      .limit(filters.limit || 50)
      .toArray();

    // Decrypt all documents
    return documents.map((doc) => this.decryptDocument(doc));
  }

  /**
   * Validate document data
   */
  private validateDocument(dto: CreateDocumentDTO): ValidationResult {
    const errors: string[] = [];

    if (!dto.patientId) {
      errors.push('patientId is required');
    }

    if (!dto.documentType) {
      errors.push('documentType is required');
    }

    if (!['fhir', 'pdf', 'text', 'markdown'].includes(dto.documentType)) {
      errors.push('documentType must be one of: fhir, pdf, text, markdown');
    }

    if (dto.documentType === 'fhir' && !dto.fhirResource) {
      errors.push('fhirResource is required for FHIR documents');
    }

    if (!dto.uploadMethod) {
      errors.push('uploadMethod is required');
    }

    if (!['naturalLanguage', 'fileUpload'].includes(dto.uploadMethod)) {
      errors.push('uploadMethod must be one of: naturalLanguage, fileUpload');
    }

    if (!dto.userId) {
      errors.push('userId is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Encrypt document PHI fields
   */
  private encryptDocument(document: MedicalDocument): MedicalDocument {
    const encrypted = { ...document };

    // Encrypt extractedText
    if (encrypted.extractedText) {
      encrypted.extractedText = this.encryptionService.encrypt(encrypted.extractedText);
    }

    // Encrypt fhirResource
    if (encrypted.fhirResource) {
      encrypted.fhirResource = this.encryptionService.encrypt(
        JSON.stringify(encrypted.fhirResource)
      );
    }

    // Encrypt structuredData
    if (encrypted.structuredData) {
      encrypted.structuredData = this.encryptionService.encrypt(
        JSON.stringify(encrypted.structuredData)
      );
    }

    encrypted.encryptionStatus = 'encrypted';

    return encrypted;
  }

  /**
   * Decrypt document PHI fields
   */
  private decryptDocument(document: MedicalDocument): MedicalDocument {
    if (document.encryptionStatus !== 'encrypted') {
      return document;
    }

    const decrypted = { ...document };

    // Decrypt extractedText
    if (decrypted.extractedText) {
      try {
        decrypted.extractedText = this.encryptionService.decrypt(decrypted.extractedText);
      } catch (error) {
        console.error('Failed to decrypt extractedText:', error);
      }
    }

    // Decrypt fhirResource
    if (decrypted.fhirResource) {
      try {
        const decryptedStr = this.encryptionService.decrypt(decrypted.fhirResource);
        decrypted.fhirResource = JSON.parse(decryptedStr);
      } catch (error) {
        console.error('Failed to decrypt fhirResource:', error);
      }
    }

    // Decrypt structuredData
    if (decrypted.structuredData) {
      try {
        const decryptedStr = this.encryptionService.decrypt(decrypted.structuredData);
        decrypted.structuredData = JSON.parse(decryptedStr);
      } catch (error) {
        console.error('Failed to decrypt structuredData:', error);
      }
    }

    return decrypted;
  }

  /**
   * Encrypt specific document fields
   */
  private encryptDocumentFields(data: Partial<MedicalDocument>): Partial<MedicalDocument> {
    const encrypted = { ...data };

    if (encrypted.extractedText) {
      encrypted.extractedText = this.encryptionService.encrypt(encrypted.extractedText);
    }

    if (encrypted.fhirResource) {
      encrypted.fhirResource = this.encryptionService.encrypt(
        JSON.stringify(encrypted.fhirResource)
      );
    }

    if (encrypted.structuredData) {
      encrypted.structuredData = this.encryptionService.encrypt(
        JSON.stringify(encrypted.structuredData)
      );
    }

    if (encrypted.extractedText || encrypted.fhirResource || encrypted.structuredData) {
      encrypted.encryptionStatus = 'encrypted';
    }

    return encrypted;
  }

  /**
   * Add audit log entry
   */
  private async addAuditEntry(documentId: string, entry: AuditEntry): Promise<void> {
    await this.collection.updateOne({ documentId }, { $push: { auditLog: entry } });
  }

  /**
   * Generate unique document ID
   */
  private generateDocumentId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}
