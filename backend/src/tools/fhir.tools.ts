/**
 * FHIR Operation Tools for LangChain Agents
 * Provides tools for validating and parsing FHIR resources
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { FHIRService } from '../service/fhir.service.js';

/**
 * Create FHIR operation tools
 */
export function createFHIRTools(fhirService: FHIRService) {
  /**
   * Validate FHIR Resource Tool
   * Validates a FHIR resource against R4 specification
   */
  const validateFHIRTool = tool(
    async ({ resource, resourceType }) => {
      try {
        // Parse resource if it's a string
        let parsedResource = resource;
        if (typeof resource === 'string') {
          try {
            parsedResource = JSON.parse(resource);
          } catch (parseError) {
            return JSON.stringify({
              success: false,
              isValid: false,
              errors: ['Invalid JSON format'],
              message: 'Resource must be valid JSON',
            });
          }
        }

        // Validate resource
        const validation = fhirService.validateResource(parsedResource, resourceType);

        return JSON.stringify({
          success: true,
          isValid: validation.isValid,
          errors: validation.errors,
          warnings: validation.warnings,
          message: validation.isValid
            ? `FHIR ${resourceType} resource is valid`
            : `FHIR ${resourceType} resource has ${validation.errors.length} validation errors`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          isValid: false,
          error: error.message,
          message: `Failed to validate FHIR resource: ${error.message}`,
        });
      }
    },
    {
      name: 'validate_fhir',
      description: 'Validate a FHIR resource against HL7 FHIR R4 specification. Use this to check if a FHIR resource is properly formatted and contains all required fields before storing or processing it.',
      schema: z.object({
        resource: z.union([z.any(), z.string()]).describe('The FHIR resource to validate (object or JSON string)'),
        resourceType: z.string().describe('The FHIR resource type (e.g., Patient, Observation, Condition, Medication)'),
      }),
    }
  );

  /**
   * Parse FHIR Bundle Tool
   * Extracts individual resources from a FHIR Bundle
   */
  const parseFHIRBundleTool = tool(
    async ({ bundle }) => {
      try {
        // Parse bundle if it's a string
        let parsedBundle = bundle;
        if (typeof bundle === 'string') {
          try {
            parsedBundle = JSON.parse(bundle);
          } catch (parseError) {
            return JSON.stringify({
              success: false,
              error: 'Invalid JSON format',
              message: 'Bundle must be valid JSON',
            });
          }
        }

        // Validate it's a bundle
        if (parsedBundle.resourceType !== 'Bundle') {
          return JSON.stringify({
            success: false,
            error: 'Not a FHIR Bundle',
            message: 'Resource must be a FHIR Bundle with resourceType "Bundle"',
          });
        }

        // Parse bundle
        const resources = fhirService.parseBundle(parsedBundle);

        // Group resources by type
        const resourcesByType: Record<string, number> = {};
        for (const resource of resources) {
          const type = resource.resourceType;
          resourcesByType[type] = (resourcesByType[type] || 0) + 1;
        }

        // Extract patient references
        const patientReferences = new Set<string>();
        for (const resource of resources) {
          const patientRef = fhirService.extractPatientReference(resource);
          if (patientRef) {
            patientReferences.add(fhirService.normalizeReference(patientRef));
          }
        }

        return JSON.stringify({
          success: true,
          bundleType: parsedBundle.type,
          totalResources: resources.length,
          resourcesByType,
          patientReferences: Array.from(patientReferences),
          resources: resources.map((r) => ({
            resourceType: r.resourceType,
            id: r.id,
            patientReference: fhirService.extractPatientReference(r),
          })),
          message: `Successfully parsed FHIR Bundle with ${resources.length} resources`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to parse FHIR Bundle: ${error.message}`,
        });
      }
    },
    {
      name: 'parse_fhir_bundle',
      description: 'Parse a FHIR Bundle and extract individual resources. Use this to process FHIR documents that contain multiple resources. Returns a summary of resources and their types.',
      schema: z.object({
        bundle: z.union([z.any(), z.string()]).describe('The FHIR Bundle to parse (object or JSON string)'),
      }),
    }
  );

  /**
   * Extract FHIR Resources Tool
   * Extracts resources from any FHIR document (Bundle or single resource)
   */
  const extractFHIRResourcesTool = tool(
    async ({ fhirDocument }) => {
      try {
        // Parse document if it's a string
        let parsedDocument = fhirDocument;
        if (typeof fhirDocument === 'string') {
          try {
            parsedDocument = JSON.parse(fhirDocument);
          } catch (parseError) {
            return JSON.stringify({
              success: false,
              error: 'Invalid JSON format',
              message: 'FHIR document must be valid JSON',
            });
          }
        }

        // Extract resources
        const resources = fhirService.extractResources(parsedDocument);

        // Validate each resource
        const validationResults = resources.map((resource) => {
          const validation = fhirService.validateResource(resource, resource.resourceType);
          return {
            resourceType: resource.resourceType,
            id: resource.id,
            isValid: validation.isValid,
            errors: validation.errors,
            warnings: validation.warnings,
          };
        });

        const validCount = validationResults.filter((r) => r.isValid).length;
        const invalidCount = validationResults.filter((r) => !r.isValid).length;

        return JSON.stringify({
          success: true,
          totalResources: resources.length,
          validResources: validCount,
          invalidResources: invalidCount,
          validationResults,
          message: `Extracted ${resources.length} resources (${validCount} valid, ${invalidCount} invalid)`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to extract FHIR resources: ${error.message}`,
        });
      }
    },
    {
      name: 'extract_fhir_resources',
      description: 'Extract and validate resources from a FHIR document (Bundle or single resource). Use this to process FHIR documents and get validation results for each resource.',
      schema: z.object({
        fhirDocument: z.union([z.any(), z.string()]).describe('The FHIR document to process (object or JSON string)'),
      }),
    }
  );

  /**
   * Create FHIR Bundle Tool
   * Creates a FHIR Bundle from individual resources
   */
  const createFHIRBundleTool = tool(
    async ({ resources, bundleType }) => {
      try {
        // Parse resources if they're strings
        const parsedResources = resources.map((resource: any) => {
          if (typeof resource === 'string') {
            return JSON.parse(resource);
          }
          return resource;
        });

        // Create bundle
        const bundle = fhirService.createBundle(parsedResources, bundleType);

        return JSON.stringify({
          success: true,
          bundle,
          resourceCount: parsedResources.length,
          message: `Created FHIR Bundle with ${parsedResources.length} resources`,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Failed to create FHIR Bundle: ${error.message}`,
        });
      }
    },
    {
      name: 'create_fhir_bundle',
      description: 'Create a FHIR Bundle from individual resources. Use this to package multiple FHIR resources into a single Bundle document.',
      schema: z.object({
        resources: z.array(z.union([z.any(), z.string()])).describe('Array of FHIR resources to bundle'),
        bundleType: z
          .enum(['document', 'message', 'transaction', 'transaction-response', 'batch', 'batch-response', 'history', 'searchset', 'collection'])
          .optional()
          .describe('Type of FHIR Bundle (default: collection)'),
      }),
    }
  );

  return {
    validateFHIRTool,
    parseFHIRBundleTool,
    extractFHIRResourcesTool,
    createFHIRBundleTool,
  };
}
