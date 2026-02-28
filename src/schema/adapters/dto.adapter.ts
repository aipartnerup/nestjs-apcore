import type { TSchema } from '@sinclair/typebox';
import type { SchemaAdapter } from './schema-adapter.interface.js';

/**
 * Property schema fragment produced during extraction.
 */
interface PropertySchema {
  type?: string;
  format?: string;
  enum?: unknown[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers to interact with class-validator's metadata storage
// ---------------------------------------------------------------------------

interface ValidationMetadataLike {
  name?: string;
  propertyName: string;
  constraints?: unknown[];
  each?: boolean;
}

/**
 * Dynamically imports class-validator's `getMetadataStorage`.
 * Returns null if class-validator is not installed.
 */
function getStorage(): {
  getTargetValidationMetadatas: (
    target: Function,
    schema: string,
    always: boolean,
    strictGroups: boolean,
    groups?: string[],
  ) => ValidationMetadataLike[];
  groupByPropertyName: (
    metadatas: ValidationMetadataLike[],
  ) => Record<string, ValidationMetadataLike[]>;
} | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cv = require('class-validator');
    return cv.getMetadataStorage();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

/**
 * SchemaAdapter that converts class-validator decorated DTO classes into
 * JSON Schema / TSchema objects.
 *
 * Detection relies on querying class-validator's global MetadataStorage for
 * validation metadata associated with the target constructor.
 */
export class DtoAdapter implements SchemaAdapter {
  readonly name = 'dto' as const;
  readonly priority = 20;

  /**
   * Returns `true` when `input` is a class constructor that has at least one
   * class-validator decorator registered in the global MetadataStorage.
   */
  detect(input: unknown): boolean {
    if (typeof input !== 'function') return false;

    const storage = getStorage();
    if (!storage) return false;

    try {
      const metadatas = storage.getTargetValidationMetadatas(
        input as Function,
        '',
        false,
        false,
      );
      return Array.isArray(metadatas) && metadatas.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Converts a class-validator DTO into a TSchema-compatible JSON Schema
   * object (type: 'object' with properties and required).
   */
  extract(input: unknown): TSchema {
    return this.extractJsonSchema(input) as unknown as TSchema;
  }

  /**
   * Reads class-validator metadata from the global MetadataStorage and builds
   * a JSON Schema object.
   *
   * Mapping rules:
   * - isString          -> type: 'string'
   * - isNumber          -> type: 'number'
   * - isInt             -> type: 'integer'
   * - isBoolean         -> type: 'boolean'
   * - isEmail           -> type: 'string', format: 'email'
   * - isUrl / isURL     -> type: 'string', format: 'uri'
   * - isEnum            -> type: 'string', enum: Object.values(constraints[0])
   * - isOptional        -> not included in required[]
   * - minLength         -> minLength constraint
   * - maxLength         -> maxLength constraint
   * - min               -> minimum
   * - max               -> maximum
   * - isArray           -> type: 'array'
   */
  extractJsonSchema(input: unknown): Record<string, unknown> {
    const ctor = input as Function;
    const storage = getStorage();

    if (!storage) {
      throw new Error(
        'class-validator is required to extract schemas from DTO classes. ' +
          'Install it: npm install class-validator',
      );
    }

    const metadatas = storage.getTargetValidationMetadatas(
      ctor,
      '',
      false,
      false,
    );
    const grouped = storage.groupByPropertyName(metadatas);

    const properties: Record<string, PropertySchema> = {};
    const required: string[] = [];

    for (const [propertyName, validators] of Object.entries(grouped)) {
      const propSchema: PropertySchema = {};
      let isOptional = false;

      for (const meta of validators) {
        const name = meta.name ?? '';
        const constraints = meta.constraints ?? [];

        switch (name) {
          // Type validators
          case 'isString':
            propSchema.type = 'string';
            break;
          case 'isNumber':
            propSchema.type = 'number';
            break;
          case 'isInt':
            propSchema.type = 'integer';
            break;
          case 'isBoolean':
            propSchema.type = 'boolean';
            break;

          // Format validators
          case 'isEmail':
            propSchema.type = 'string';
            propSchema.format = 'email';
            break;
          case 'isUrl':
          case 'isURL':
            propSchema.type = 'string';
            propSchema.format = 'uri';
            break;

          // Enum
          case 'isEnum':
            propSchema.type = 'string';
            if (constraints[0] != null) {
              propSchema.enum = Object.values(constraints[0] as object);
            }
            break;

          // Optional
          case 'isOptional':
          case 'conditionalValidation':
            isOptional = true;
            break;

          // String constraints
          case 'minLength':
            propSchema.minLength =
              typeof constraints[0] === 'number' ? constraints[0] : undefined;
            break;
          case 'maxLength':
            propSchema.maxLength =
              typeof constraints[0] === 'number' ? constraints[0] : undefined;
            break;

          // Number constraints
          case 'min':
            propSchema.minimum =
              typeof constraints[0] === 'number' ? constraints[0] : undefined;
            break;
          case 'max':
            propSchema.maximum =
              typeof constraints[0] === 'number' ? constraints[0] : undefined;
            break;

          // Array
          case 'isArray':
            propSchema.type = 'array';
            break;
        }
      }

      // Fall back to design:type if no type validator was found
      if (!propSchema.type) {
        const designType = Reflect.getMetadata(
          'design:type',
          ctor.prototype as object,
          propertyName,
        );
        if (designType) {
          propSchema.type = designTypeToJsonType(designType);
        }
      }

      // Clean up undefined values from constraints that had no value
      for (const key of Object.keys(propSchema)) {
        if (propSchema[key] === undefined) {
          delete propSchema[key];
        }
      }

      properties[propertyName] = propSchema;

      if (!isOptional) {
        required.push(propertyName);
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }
}

/**
 * Maps a design:type constructor to a JSON Schema type string.
 */
function designTypeToJsonType(designType: Function): string | undefined {
  switch (designType) {
    case String:
      return 'string';
    case Number:
      return 'number';
    case Boolean:
      return 'boolean';
    case Array:
      return 'array';
    default:
      return undefined;
  }
}
