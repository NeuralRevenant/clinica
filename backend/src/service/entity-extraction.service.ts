import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

export type EntityType = 'condition' | 'medication' | 'procedure' | 'observation';

export interface MedicalEntity {
  text: string;
  type: EntityType;
  startOffset: number;
  endOffset: number;
  confidence: number;
  normalizedCode?: string;
  normalizedSystem?: string;
  normalizedDisplay?: string;
}

export interface NormalizedEntity {
  originalText: string;
  normalizedCode: string;
  system: string;
  display: string;
  confidence: number;
}

// Zod schema for structured entity extraction
const EntitySchema = z.object({
  entities: z.array(
    z.object({
      text: z.string().describe('The exact text of the medical entity'),
      type: z.enum(['condition', 'medication', 'procedure', 'observation']).describe('The type of medical entity'),
      confidence: z.number().min(0).max(1).describe('Confidence score between 0 and 1'),
      normalizedCode: z.string().optional().describe('Standard medical code (SNOMED CT, RxNorm, LOINC)'),
      normalizedSystem: z.string().optional().describe('Coding system (e.g., SNOMED CT, RxNorm, LOINC)'),
      normalizedDisplay: z.string().optional().describe('Standard display name'),
    })
  ),
});

/**
 * Entity Extraction Service - Extracts medical entities from unstructured text
 * Uses GPT-4 for entity recognition and normalization to standard terminologies
 */
export class EntityExtractionService {
  private llm: ChatOpenAI;

  constructor(openaiApiKey: string, modelName: string = 'gpt-4') {
    this.llm = new ChatOpenAI({
      openAIApiKey: openaiApiKey,
      modelName: modelName,
      temperature: 0, // Deterministic for entity extraction
    });
  }

  /**
   * Extract medical entities from text
   */
  async extractEntities(text: string): Promise<MedicalEntity[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const prompt = this.buildExtractionPrompt(text);

    try {
      // Use structured output for reliable parsing
      const llmWithStructuredOutput = this.llm.withStructuredOutput(EntitySchema);
      const result = await llmWithStructuredOutput.invoke(prompt);

      // Add offsets to entities
      const entities: MedicalEntity[] = [];
      for (const entity of result.entities) {
        const startOffset = text.toLowerCase().indexOf(entity.text.toLowerCase());
        const endOffset = startOffset + entity.text.length;

        entities.push({
          text: entity.text,
          type: entity.type,
          startOffset: startOffset >= 0 ? startOffset : 0,
          endOffset: endOffset >= 0 ? endOffset : entity.text.length,
          confidence: entity.confidence,
          normalizedCode: entity.normalizedCode,
          normalizedSystem: entity.normalizedSystem,
          normalizedDisplay: entity.normalizedDisplay,
        });
      }

      return entities;
    } catch (error) {
      console.error('Error extracting entities:', error);
      throw new Error('Failed to extract medical entities from text');
    }
  }

  /**
   * Normalize a single entity to standard terminology
   */
  async normalizeEntity(entityText: string, type: EntityType): Promise<NormalizedEntity> {
    const prompt = this.buildNormalizationPrompt(entityText, type);

    try {
      const NormalizationSchema = z.object({
        normalizedCode: z.string().describe('Standard medical code'),
        system: z.string().describe('Coding system (SNOMED CT, RxNorm, LOINC, CPT)'),
        display: z.string().describe('Standard display name'),
        confidence: z.number().min(0).max(1).describe('Confidence in normalization'),
      });

      const llmWithStructuredOutput = this.llm.withStructuredOutput(NormalizationSchema);
      const result = await llmWithStructuredOutput.invoke(prompt);

      return {
        originalText: entityText,
        normalizedCode: result.normalizedCode,
        system: result.system,
        display: result.display,
        confidence: result.confidence,
      };
    } catch (error) {
      console.error('Error normalizing entity:', error);
      throw new Error(`Failed to normalize entity: ${entityText}`);
    }
  }

  /**
   * Extract entities by type
   */
  async extractEntitiesByType(text: string, type: EntityType): Promise<MedicalEntity[]> {
    const allEntities = await this.extractEntities(text);
    return allEntities.filter((entity) => entity.type === type);
  }

  /**
   * Extract and normalize entities in one call
   */
  async extractAndNormalizeEntities(text: string): Promise<MedicalEntity[]> {
    const entities = await this.extractEntities(text);

    // Entities are already normalized by the extraction prompt
    return entities;
  }

  /**
   * Build prompt for entity extraction
   */
  private buildExtractionPrompt(text: string): string {
    return `You are a medical entity extraction system. Extract all medical entities from the following text and normalize them to standard medical terminologies.

For each entity, provide:
1. The exact text as it appears
2. The entity type (condition, medication, procedure, or observation)
3. A confidence score (0-1)
4. If possible, the normalized code from standard terminologies:
   - Conditions: SNOMED CT codes
   - Medications: RxNorm codes
   - Procedures: CPT or SNOMED CT codes
   - Observations: LOINC codes
5. The coding system used (e.g., "SNOMED CT", "RxNorm", "LOINC", "CPT")
6. The standard display name

Text to analyze:
"""
${text}
"""

Extract all medical entities with their normalized codes.`;
  }

  /**
   * Build prompt for entity normalization
   */
  private buildNormalizationPrompt(entityText: string, type: EntityType): string {
    const systemGuidance = {
      condition: 'Use SNOMED CT codes for conditions and diagnoses',
      medication: 'Use RxNorm codes for medications and drugs',
      procedure: 'Use CPT codes for procedures, or SNOMED CT if CPT is not applicable',
      observation: 'Use LOINC codes for laboratory tests and clinical observations',
    };

    return `You are a medical terminology normalization system. Normalize the following medical entity to a standard medical code.

Entity: "${entityText}"
Type: ${type}

${systemGuidance[type]}

Provide:
1. The standard code
2. The coding system name
3. The standard display name
4. Your confidence in this normalization (0-1)

If you cannot find an exact match, provide the closest match and lower the confidence score accordingly.`;
  }

  /**
   * Batch extract entities from multiple texts
   */
  async batchExtractEntities(texts: string[]): Promise<MedicalEntity[][]> {
    const results: MedicalEntity[][] = [];

    // Process in parallel with concurrency limit
    const concurrencyLimit = 5;
    for (let i = 0; i < texts.length; i += concurrencyLimit) {
      const batch = texts.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(
        batch.map((text) => this.extractEntities(text))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Get entity statistics from text
   */
  async getEntityStatistics(text: string): Promise<{
    total: number;
    byType: Record<EntityType, number>;
    averageConfidence: number;
  }> {
    const entities = await this.extractEntities(text);

    const byType: Record<EntityType, number> = {
      condition: 0,
      medication: 0,
      procedure: 0,
      observation: 0,
    };

    let totalConfidence = 0;

    for (const entity of entities) {
      byType[entity.type]++;
      totalConfidence += entity.confidence;
    }

    return {
      total: entities.length,
      byType,
      averageConfidence: entities.length > 0 ? totalConfidence / entities.length : 0,
    };
  }

  /**
   * Filter entities by confidence threshold
   */
  filterByConfidence(entities: MedicalEntity[], minConfidence: number): MedicalEntity[] {
    return entities.filter((entity) => entity.confidence >= minConfidence);
  }

  /**
   * Group entities by type
   */
  groupByType(entities: MedicalEntity[]): Record<EntityType, MedicalEntity[]> {
    const grouped: Record<EntityType, MedicalEntity[]> = {
      condition: [],
      medication: [],
      procedure: [],
      observation: [],
    };

    for (const entity of entities) {
      grouped[entity.type].push(entity);
    }

    return grouped;
  }

  /**
   * Deduplicate entities (remove duplicates based on text and type)
   */
  deduplicateEntities(entities: MedicalEntity[]): MedicalEntity[] {
    const seen = new Set<string>();
    const deduplicated: MedicalEntity[] = [];

    for (const entity of entities) {
      const key = `${entity.type}:${entity.text.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(entity);
      }
    }

    return deduplicated;
  }
}
