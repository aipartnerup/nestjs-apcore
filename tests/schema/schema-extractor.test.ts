import 'reflect-metadata';
import { Type } from '@sinclair/typebox';
import { z } from 'zod';
import { IsString, IsNumber, IsOptional } from 'class-validator';
import {
  SchemaExtractor,
  SchemaExtractionError,
} from '../../src/schema/schema-extractor.service.js';
import type { SchemaAdapter } from '../../src/schema/adapters/schema-adapter.interface.js';
import type { TSchema } from '@sinclair/typebox';

// ---------------------------------------------------------------------------
// Test DTO class (class-validator decorated)
// ---------------------------------------------------------------------------

class TestDto {
  @IsString()
  name!: string;

  @IsNumber()
  age!: number;

  @IsOptional()
  @IsString()
  nickname?: string;
}

// ---------------------------------------------------------------------------
// Test schemas
// ---------------------------------------------------------------------------

const typeboxSchema = Type.Object({ name: Type.String() });
const zodSchema = z.object({ name: z.string() });
const jsonSchema = { type: 'object', properties: { name: { type: 'string' } } };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaExtractionError', () => {
  it('extends Error', () => {
    const err = new SchemaExtractionError('test');
    expect(err).toBeInstanceOf(Error);
  });

  it('has name "SchemaExtractionError"', () => {
    const err = new SchemaExtractionError('test');
    expect(err.name).toBe('SchemaExtractionError');
  });

  it('preserves the message', () => {
    const err = new SchemaExtractionError('something went wrong');
    expect(err.message).toBe('something went wrong');
  });
});

describe('SchemaExtractor', () => {
  let extractor: SchemaExtractor;

  beforeEach(() => {
    extractor = new SchemaExtractor();
  });

  // -----------------------------------------------------------------------
  // detect()
  // -----------------------------------------------------------------------

  describe('detect()', () => {
    it('detects TypeBox schemas and returns "typebox"', () => {
      expect(extractor.detect(typeboxSchema)).toBe('typebox');
    });

    it('detects Zod schemas and returns "zod"', () => {
      expect(extractor.detect(zodSchema)).toBe('zod');
    });

    it('detects plain JSON Schema and returns "json-schema"', () => {
      expect(extractor.detect(jsonSchema)).toBe('json-schema');
    });

    it('detects class-validator DTO and returns "dto"', () => {
      expect(extractor.detect(TestDto)).toBe('dto');
    });

    it('returns null for a string', () => {
      expect(extractor.detect('hello')).toBeNull();
    });

    it('returns null for a number', () => {
      expect(extractor.detect(42)).toBeNull();
    });

    it('returns null for null', () => {
      expect(extractor.detect(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(extractor.detect(undefined)).toBeNull();
    });

    it('returns null for an empty object', () => {
      expect(extractor.detect({})).toBeNull();
    });

    it('returns null for an array', () => {
      expect(extractor.detect([1, 2, 3])).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // extract()
  // -----------------------------------------------------------------------

  describe('extract()', () => {
    it('extracts a TSchema from a TypeBox schema', () => {
      const result = extractor.extract(typeboxSchema);
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>)['type']).toBe('object');
    });

    it('extracts a TSchema from a Zod schema', () => {
      const result = extractor.extract(zodSchema);
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>)['type']).toBe('object');
    });

    it('extracts a TSchema from a plain JSON Schema', () => {
      const result = extractor.extract(jsonSchema);
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>)['type']).toBe('object');
    });

    it('extracts a TSchema from a class-validator DTO', () => {
      const result = extractor.extract(TestDto);
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>)['type']).toBe('object');
    });

    it('throws SchemaExtractionError for a string', () => {
      expect(() => extractor.extract('hello')).toThrow(SchemaExtractionError);
    });

    it('throws SchemaExtractionError for a number', () => {
      expect(() => extractor.extract(42)).toThrow(SchemaExtractionError);
    });

    it('throws SchemaExtractionError for null', () => {
      expect(() => extractor.extract(null)).toThrow(SchemaExtractionError);
    });

    it('throws SchemaExtractionError for undefined', () => {
      expect(() => extractor.extract(undefined)).toThrow(SchemaExtractionError);
    });

    it('error message mentions no adapter matched', () => {
      expect(() => extractor.extract('hello')).toThrow(/no.*adapter/i);
    });
  });

  // -----------------------------------------------------------------------
  // extractJsonSchema()
  // -----------------------------------------------------------------------

  describe('extractJsonSchema()', () => {
    it('extracts JSON Schema from a TypeBox schema', () => {
      const result = extractor.extractJsonSchema(typeboxSchema);
      expect(result['type']).toBe('object');
      expect(result['properties']).toBeDefined();
    });

    it('extracts JSON Schema from a Zod schema', () => {
      const result = extractor.extractJsonSchema(zodSchema);
      expect(result['type']).toBe('object');
      expect(result['properties']).toBeDefined();
    });

    it('extracts JSON Schema from a plain JSON Schema', () => {
      const result = extractor.extractJsonSchema(jsonSchema);
      expect(result['type']).toBe('object');
      expect(result['properties']).toBeDefined();
    });

    it('extracts JSON Schema from a class-validator DTO', () => {
      const result = extractor.extractJsonSchema(TestDto);
      expect(result['type']).toBe('object');
      expect(result['properties']).toBeDefined();
    });

    it('throws SchemaExtractionError for a string', () => {
      expect(() => extractor.extractJsonSchema('hello')).toThrow(
        SchemaExtractionError,
      );
    });

    it('throws SchemaExtractionError for null', () => {
      expect(() => extractor.extractJsonSchema(null)).toThrow(
        SchemaExtractionError,
      );
    });

    it('returns a deep clone (different reference) for JSON Schema input', () => {
      const result = extractor.extractJsonSchema(jsonSchema);
      expect(result).not.toBe(jsonSchema);
    });
  });

  // -----------------------------------------------------------------------
  // Priority ordering
  // -----------------------------------------------------------------------

  describe('priority ordering', () => {
    it('tries adapters in descending priority order (highest first)', () => {
      // TypeBox (100) should be detected before JSON Schema (30),
      // even though TypeBox schemas also have a "type" property.
      const result = extractor.detect(typeboxSchema);
      expect(result).toBe('typebox');
    });
  });

  // -----------------------------------------------------------------------
  // registerAdapter()
  // -----------------------------------------------------------------------

  describe('registerAdapter()', () => {
    it('adds a custom adapter that takes priority when it has higher priority', () => {
      const customAdapter: SchemaAdapter = {
        name: 'custom',
        priority: 200, // higher than TypeBox (100)
        detect(input: unknown): boolean {
          return (
            typeof input === 'object' &&
            input !== null &&
            'customMarker' in (input as Record<string, unknown>)
          );
        },
        extract(_input: unknown): TSchema {
          return { type: 'string' } as unknown as TSchema;
        },
        extractJsonSchema(_input: unknown): Record<string, unknown> {
          return { type: 'string', custom: true };
        },
      };

      extractor.registerAdapter(customAdapter);

      const customInput = { customMarker: true, type: 'object' };
      expect(extractor.detect(customInput)).toBe('custom');
    });

    it('custom adapter with lower priority is tried after built-ins', () => {
      const lowPriorityAdapter: SchemaAdapter = {
        name: 'low-priority',
        priority: 10, // lower than all built-ins
        detect(_input: unknown): boolean {
          return true; // catches everything
        },
        extract(_input: unknown): TSchema {
          return {} as TSchema;
        },
        extractJsonSchema(_input: unknown): Record<string, unknown> {
          return {};
        },
      };

      extractor.registerAdapter(lowPriorityAdapter);

      // TypeBox should still be detected first (higher priority)
      expect(extractor.detect(typeboxSchema)).toBe('typebox');

      // But unknown input should now be caught by the low-priority adapter
      expect(extractor.detect('anything')).toBe('low-priority');
    });

    it('registered adapter is used for extract()', () => {
      const customAdapter: SchemaAdapter = {
        name: 'custom-extract',
        priority: 200,
        detect(input: unknown): boolean {
          return input === 'magic-string';
        },
        extract(_input: unknown): TSchema {
          return { type: 'number', custom: true } as unknown as TSchema;
        },
        extractJsonSchema(_input: unknown): Record<string, unknown> {
          return { type: 'number', custom: true };
        },
      };

      extractor.registerAdapter(customAdapter);

      const result = extractor.extract('magic-string');
      expect((result as Record<string, unknown>)['custom']).toBe(true);
    });

    it('registered adapter is used for extractJsonSchema()', () => {
      const customAdapter: SchemaAdapter = {
        name: 'custom-json',
        priority: 200,
        detect(input: unknown): boolean {
          return input === 'magic-string';
        },
        extract(_input: unknown): TSchema {
          return {} as TSchema;
        },
        extractJsonSchema(_input: unknown): Record<string, unknown> {
          return { type: 'string', fromCustom: true };
        },
      };

      extractor.registerAdapter(customAdapter);

      const result = extractor.extractJsonSchema('magic-string');
      expect(result['fromCustom']).toBe(true);
    });

    it('re-sorts adapters after registration', () => {
      // Register adapter with priority between Zod (50) and TypeBox (100)
      const midAdapter: SchemaAdapter = {
        name: 'mid-priority',
        priority: 75,
        detect(input: unknown): boolean {
          return input === 'mid-input';
        },
        extract(_input: unknown): TSchema {
          return {} as TSchema;
        },
        extractJsonSchema(_input: unknown): Record<string, unknown> {
          return {};
        },
      };

      extractor.registerAdapter(midAdapter);

      // The mid-priority adapter should detect before Zod but after TypeBox
      expect(extractor.detect('mid-input')).toBe('mid-priority');
    });
  });
});
