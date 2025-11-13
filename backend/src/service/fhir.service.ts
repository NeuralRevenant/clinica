/**
 * FHIR Service - Handles FHIR R4 resource validation, parsing, and extraction
 * Implements validation against HL7 FHIR R4 specification
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface FHIRResource {
  resourceType: string;
  id?: string;
  meta?: any;
  [key: string]: any;
}

export interface FHIRBundle {
  resourceType: 'Bundle';
  type: 'document' | 'message' | 'transaction' | 'transaction-response' | 'batch' | 'batch-response' | 'history' | 'searchset' | 'collection';
  entry?: Array<{
    fullUrl?: string;
    resource?: FHIRResource;
    search?: any;
    request?: any;
    response?: any;
  }>;
  total?: number;
}

export class FHIRService {
  private readonly SUPPORTED_RESOURCES = [
    'Patient',
    'Observation',
    'Condition',
    'Medication',
    'MedicationRequest',
    'Procedure',
    'DiagnosticReport',
    'DocumentReference',
    'Encounter',
    'AllergyIntolerance',
  ];

  /**
   * Validate FHIR resource against R4 specification
   */
  validateResource(resource: any, resourceType: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if resource exists
    if (!resource) {
      errors.push('Resource is null or undefined');
      return { isValid: false, errors, warnings };
    }

    // Check resourceType
    if (!resource.resourceType) {
      errors.push('Missing required field: resourceType');
    } else if (resource.resourceType !== resourceType) {
      errors.push(
        `Resource type mismatch: expected ${resourceType}, got ${resource.resourceType}`
      );
    }

    // Check if resource type is supported
    if (!this.SUPPORTED_RESOURCES.includes(resourceType)) {
      warnings.push(`Resource type ${resourceType} may not be fully supported`);
    }

    // Validate based on resource type
    switch (resourceType) {
      case 'Patient':
        this.validatePatient(resource, errors, warnings);
        break;
      case 'Observation':
        this.validateObservation(resource, errors, warnings);
        break;
      case 'Condition':
        this.validateCondition(resource, errors, warnings);
        break;
      case 'Medication':
      case 'MedicationRequest':
        this.validateMedication(resource, errors, warnings);
        break;
      case 'Procedure':
        this.validateProcedure(resource, errors, warnings);
        break;
      default:
        this.validateGenericResource(resource, errors, warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Parse FHIR bundle and extract resources
   */
  parseBundle(bundle: any): FHIRResource[] {
    if (!bundle || bundle.resourceType !== 'Bundle') {
      throw new Error('Invalid FHIR Bundle: resourceType must be "Bundle"');
    }

    if (!bundle.entry || !Array.isArray(bundle.entry)) {
      return [];
    }

    const resources: FHIRResource[] = [];

    for (const entry of bundle.entry) {
      if (entry.resource) {
        resources.push(entry.resource);
      }
    }

    return resources;
  }

  /**
   * Extract resources from FHIR document
   */
  extractResources(fhirDoc: any): FHIRResource[] {
    // If it's a bundle, parse it
    if (fhirDoc.resourceType === 'Bundle') {
      return this.parseBundle(fhirDoc);
    }

    // If it's a single resource, return it as an array
    if (fhirDoc.resourceType) {
      return [fhirDoc];
    }

    throw new Error('Invalid FHIR document: must be a Bundle or a single resource');
  }

  /**
   * Validate Patient resource
   */
  private validatePatient(resource: any, errors: string[], warnings: string[]): void {
    // Required fields
    if (!resource.name || resource.name.length === 0) {
      errors.push('Patient.name is required');
    } else {
      // Validate name structure
      for (const name of resource.name) {
        if (!name.family && !name.given) {
          errors.push('Patient.name must have either family or given name');
        }
      }
    }

    // Validate gender
    if (resource.gender) {
      const validGenders = ['male', 'female', 'other', 'unknown'];
      if (!validGenders.includes(resource.gender)) {
        errors.push(
          `Patient.gender must be one of: ${validGenders.join(', ')}`
        );
      }
    }

    // Validate birthDate format
    if (resource.birthDate && !this.isValidDate(resource.birthDate)) {
      errors.push('Patient.birthDate must be in YYYY-MM-DD format');
    }

    // Validate identifier
    if (resource.identifier && Array.isArray(resource.identifier)) {
      for (const identifier of resource.identifier) {
        if (!identifier.system || !identifier.value) {
          errors.push('Patient.identifier must have system and value');
        }
      }
    }

    // Validate telecom
    if (resource.telecom && Array.isArray(resource.telecom)) {
      for (const telecom of resource.telecom) {
        if (!telecom.system || !telecom.value) {
          errors.push('Patient.telecom must have system and value');
        }
        if (telecom.system && !['phone', 'fax', 'email', 'pager', 'url', 'sms', 'other'].includes(telecom.system)) {
          errors.push(`Invalid telecom system: ${telecom.system}`);
        }
      }
    }
  }

  /**
   * Validate Observation resource
   */
  private validateObservation(resource: any, errors: string[], warnings: string[]): void {
    // Required fields
    if (!resource.status) {
      errors.push('Observation.status is required');
    } else {
      const validStatuses = ['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown'];
      if (!validStatuses.includes(resource.status)) {
        errors.push(`Observation.status must be one of: ${validStatuses.join(', ')}`);
      }
    }

    if (!resource.code) {
      errors.push('Observation.code is required');
    } else {
      this.validateCodeableConcept(resource.code, 'Observation.code', errors);
    }

    // Must have either value or dataAbsentReason
    if (!resource.value && !resource.valueQuantity && !resource.valueCodeableConcept && 
        !resource.valueString && !resource.valueBoolean && !resource.valueInteger && 
        !resource.valueRange && !resource.valueRatio && !resource.valueSampledData && 
        !resource.valueTime && !resource.valueDateTime && !resource.valuePeriod && 
        !resource.dataAbsentReason) {
      errors.push('Observation must have either a value[x] or dataAbsentReason');
    }

    // Validate subject reference
    if (resource.subject && !resource.subject.reference) {
      errors.push('Observation.subject must have a reference');
    }

    // Validate effectiveDateTime or effectivePeriod
    if (resource.effectiveDateTime && !this.isValidDateTime(resource.effectiveDateTime)) {
      errors.push('Observation.effectiveDateTime must be a valid ISO 8601 datetime');
    }
  }

  /**
   * Validate Condition resource
   */
  private validateCondition(resource: any, errors: string[], warnings: string[]): void {
    // Required fields
    if (!resource.code) {
      errors.push('Condition.code is required');
    } else {
      this.validateCodeableConcept(resource.code, 'Condition.code', errors);
    }

    if (!resource.subject) {
      errors.push('Condition.subject is required');
    } else if (!resource.subject.reference) {
      errors.push('Condition.subject must have a reference');
    }

    // Validate clinicalStatus
    if (resource.clinicalStatus) {
      this.validateCodeableConcept(resource.clinicalStatus, 'Condition.clinicalStatus', errors);
    }

    // Validate verificationStatus
    if (resource.verificationStatus) {
      this.validateCodeableConcept(resource.verificationStatus, 'Condition.verificationStatus', errors);
    }

    // Validate onsetDateTime
    if (resource.onsetDateTime && !this.isValidDateTime(resource.onsetDateTime)) {
      errors.push('Condition.onsetDateTime must be a valid ISO 8601 datetime');
    }
  }

  /**
   * Validate Medication/MedicationRequest resource
   */
  private validateMedication(resource: any, errors: string[], warnings: string[]): void {
    if (resource.resourceType === 'MedicationRequest') {
      // Required fields for MedicationRequest
      if (!resource.status) {
        errors.push('MedicationRequest.status is required');
      }

      if (!resource.intent) {
        errors.push('MedicationRequest.intent is required');
      }

      if (!resource.medication && !resource.medicationCodeableConcept && !resource.medicationReference) {
        errors.push('MedicationRequest must have medication[x]');
      }

      if (!resource.subject) {
        errors.push('MedicationRequest.subject is required');
      } else if (!resource.subject.reference) {
        errors.push('MedicationRequest.subject must have a reference');
      }
    } else {
      // Medication resource
      if (!resource.code) {
        errors.push('Medication.code is required');
      } else {
        this.validateCodeableConcept(resource.code, 'Medication.code', errors);
      }
    }
  }

  /**
   * Validate Procedure resource
   */
  private validateProcedure(resource: any, errors: string[], warnings: string[]): void {
    // Required fields
    if (!resource.status) {
      errors.push('Procedure.status is required');
    }

    if (!resource.subject) {
      errors.push('Procedure.subject is required');
    } else if (!resource.subject.reference) {
      errors.push('Procedure.subject must have a reference');
    }

    if (!resource.code) {
      errors.push('Procedure.code is required');
    } else {
      this.validateCodeableConcept(resource.code, 'Procedure.code', errors);
    }
  }

  /**
   * Validate generic FHIR resource
   */
  private validateGenericResource(resource: any, errors: string[], warnings: string[]): void {
    // Basic validation for any FHIR resource
    if (!resource.resourceType) {
      errors.push('resourceType is required');
    }

    // Check for common fields
    if (resource.id && typeof resource.id !== 'string') {
      errors.push('id must be a string');
    }

    if (resource.meta && typeof resource.meta !== 'object') {
      errors.push('meta must be an object');
    }
  }

  /**
   * Validate CodeableConcept
   */
  private validateCodeableConcept(concept: any, fieldName: string, errors: string[]): void {
    if (!concept) {
      errors.push(`${fieldName} is required`);
      return;
    }

    if (!concept.coding && !concept.text) {
      errors.push(`${fieldName} must have either coding or text`);
    }

    if (concept.coding && Array.isArray(concept.coding)) {
      for (const coding of concept.coding) {
        if (!coding.system && !coding.code) {
          errors.push(`${fieldName}.coding must have system or code`);
        }
      }
    }
  }

  /**
   * Validate date format (YYYY-MM-DD)
   */
  private isValidDate(dateString: string): boolean {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) {
      return false;
    }

    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }

  /**
   * Validate datetime format (ISO 8601)
   */
  private isValidDateTime(dateTimeString: string): boolean {
    const date = new Date(dateTimeString);
    return !isNaN(date.getTime());
  }

  /**
   * Create a FHIR Bundle from resources
   */
  createBundle(resources: FHIRResource[], bundleType: FHIRBundle['type'] = 'collection'): FHIRBundle {
    return {
      resourceType: 'Bundle',
      type: bundleType,
      entry: resources.map((resource) => ({
        resource,
      })),
      total: resources.length,
    };
  }

  /**
   * Extract patient reference from resource
   */
  extractPatientReference(resource: FHIRResource): string | null {
    // Common fields that contain patient reference
    const patientFields = ['subject', 'patient'];

    for (const field of patientFields) {
      if (resource[field]?.reference) {
        return resource[field].reference;
      }
    }

    return null;
  }

  /**
   * Normalize resource ID from reference
   */
  normalizeReference(reference: string): string {
    // Remove resource type prefix if present (e.g., "Patient/123" -> "123")
    const parts = reference.split('/');
    return parts[parts.length - 1];
  }
}
