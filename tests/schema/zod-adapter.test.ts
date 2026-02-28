import { z } from 'zod';
import { ZodAdapter } from '../../src/schema/adapters/zod.adapter.js';
import type { SchemaAdapter } from '../../src/schema/adapters/schema-adapter.interface.js';

// ---------------------------------------------------------------------------
// Tests: ZodAdapter
// ---------------------------------------------------------------------------

describe('ZodAdapter', () => {
  let adapter: SchemaAdapter;

  beforeEach(() => {
    adapter = new ZodAdapter();
  });

  // ---- metadata ----

  describe('metadata', () => {
    it('has name "zod"', () => {
      expect(adapter.name).toBe('zod');
    });

    it('has priority 50', () => {
      expect(adapter.priority).toBe(50);
    });
  });

  // ---- detect() ----

  describe('detect()', () => {
    it('detects a Zod string schema', () => {
      expect(adapter.detect(z.string())).toBe(true);
    });

    it('detects a Zod number schema', () => {
      expect(adapter.detect(z.number())).toBe(true);
    });

    it('detects a Zod boolean schema', () => {
      expect(adapter.detect(z.boolean())).toBe(true);
    });

    it('detects a Zod object schema', () => {
      expect(adapter.detect(z.object({ name: z.string() }))).toBe(true);
    });

    it('detects a Zod array schema', () => {
      expect(adapter.detect(z.array(z.string()))).toBe(true);
    });

    it('detects a Zod enum schema', () => {
      expect(adapter.detect(z.enum(['a', 'b', 'c']))).toBe(true);
    });

    it('does not detect null', () => {
      expect(adapter.detect(null)).toBe(false);
    });

    it('does not detect undefined', () => {
      expect(adapter.detect(undefined)).toBe(false);
    });

    it('does not detect a plain string', () => {
      expect(adapter.detect('hello')).toBe(false);
    });

    it('does not detect a plain number', () => {
      expect(adapter.detect(42)).toBe(false);
    });

    it('does not detect a plain object', () => {
      expect(adapter.detect({ type: 'string' })).toBe(false);
    });

    it('does not detect a plain object with _def but no safeParse', () => {
      expect(adapter.detect({ _def: { typeName: 'ZodString' } })).toBe(false);
    });
  });

  // ---- extract() / extractJsonSchema() — primitives ----

  describe('primitive schemas', () => {
    it('converts z.string() to { type: "string" }', () => {
      const result = adapter.extractJsonSchema(z.string());
      expect(result['type']).toBe('string');
    });

    it('converts z.number() to { type: "number" }', () => {
      const result = adapter.extractJsonSchema(z.number());
      expect(result['type']).toBe('number');
    });

    it('converts z.boolean() to { type: "boolean" }', () => {
      const result = adapter.extractJsonSchema(z.boolean());
      expect(result['type']).toBe('boolean');
    });
  });

  // ---- extract() — object with required and optional fields ----

  describe('object with required and optional fields', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      nickname: z.string().optional(),
    });

    it('produces type "object"', () => {
      const result = adapter.extractJsonSchema(schema);
      expect(result['type']).toBe('object');
    });

    it('includes properties for all fields', () => {
      const result = adapter.extractJsonSchema(schema);
      const props = result['properties'] as Record<string, unknown>;
      expect(props['name']).toBeDefined();
      expect(props['age']).toBeDefined();
      expect(props['nickname']).toBeDefined();
    });

    it('marks required fields in the required array', () => {
      const result = adapter.extractJsonSchema(schema);
      const required = result['required'] as string[];
      expect(required).toContain('name');
      expect(required).toContain('age');
    });

    it('does not mark optional fields as required', () => {
      const result = adapter.extractJsonSchema(schema);
      const required = result['required'] as string[];
      expect(required).not.toContain('nickname');
    });
  });

  // ---- nested objects ----

  describe('nested objects', () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        address: z.object({
          city: z.string(),
          zip: z.string(),
        }),
      }),
    });

    it('converts nested objects recursively', () => {
      const result = adapter.extractJsonSchema(schema);
      const props = result['properties'] as Record<string, Record<string, unknown>>;

      expect(props['user']['type']).toBe('object');
      const userProps = props['user']['properties'] as Record<string, Record<string, unknown>>;
      expect(userProps['name']['type']).toBe('string');
      expect(userProps['address']['type']).toBe('object');

      const addressProps = userProps['address']['properties'] as Record<string, Record<string, unknown>>;
      expect(addressProps['city']['type']).toBe('string');
      expect(addressProps['zip']['type']).toBe('string');
    });
  });

  // ---- arrays ----

  describe('arrays', () => {
    it('converts z.array(z.string()) to array with string items', () => {
      const result = adapter.extractJsonSchema(z.array(z.string()));
      expect(result['type']).toBe('array');
      const items = result['items'] as Record<string, unknown>;
      expect(items['type']).toBe('string');
    });

    it('converts z.array(z.object({...})) to array with object items', () => {
      const schema = z.array(z.object({ id: z.number() }));
      const result = adapter.extractJsonSchema(schema);
      expect(result['type']).toBe('array');
      const items = result['items'] as Record<string, unknown>;
      expect(items['type']).toBe('object');
    });
  });

  // ---- enums ----

  describe('enums', () => {
    it('converts z.enum() to string with enum values', () => {
      const result = adapter.extractJsonSchema(z.enum(['red', 'green', 'blue']));
      expect(result['type']).toBe('string');
      expect(result['enum']).toEqual(['red', 'green', 'blue']);
    });

    it('converts z.nativeEnum() to string with enum values', () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      const result = adapter.extractJsonSchema(z.nativeEnum(Color));
      expect(result['type']).toBe('string');
      expect(result['enum']).toEqual(['red', 'green', 'blue']);
    });
  });

  // ---- number constraints ----

  describe('number constraints', () => {
    it('converts z.number().int() to { type: "integer" }', () => {
      const result = adapter.extractJsonSchema(z.number().int());
      expect(result['type']).toBe('integer');
    });

    it('converts z.number().min(5) to { type: "number", minimum: 5 }', () => {
      const result = adapter.extractJsonSchema(z.number().min(5));
      expect(result['type']).toBe('number');
      expect(result['minimum']).toBe(5);
    });

    it('converts z.number().max(100) to { type: "number", maximum: 100 }', () => {
      const result = adapter.extractJsonSchema(z.number().max(100));
      expect(result['type']).toBe('number');
      expect(result['maximum']).toBe(100);
    });

    it('converts z.number().int().min(0).max(255)', () => {
      const result = adapter.extractJsonSchema(z.number().int().min(0).max(255));
      expect(result['type']).toBe('integer');
      expect(result['minimum']).toBe(0);
      expect(result['maximum']).toBe(255);
    });
  });

  // ---- descriptions ----

  describe('descriptions', () => {
    it('includes description from .describe()', () => {
      const result = adapter.extractJsonSchema(z.string().describe('A user name'));
      expect(result['description']).toBe('A user name');
    });

    it('includes description on object fields', () => {
      const schema = z.object({
        name: z.string().describe('The full name'),
      });
      const result = adapter.extractJsonSchema(schema);
      const props = result['properties'] as Record<string, Record<string, unknown>>;
      expect(props['name']['description']).toBe('The full name');
    });
  });

  // ---- default values ----

  describe('default values', () => {
    it('includes the default value', () => {
      const result = adapter.extractJsonSchema(z.string().default('hello'));
      expect(result['default']).toBe('hello');
    });

    it('default fields are not required in parent object', () => {
      const schema = z.object({
        name: z.string(),
        role: z.string().default('user'),
      });
      const result = adapter.extractJsonSchema(schema);
      const required = result['required'] as string[];
      expect(required).toContain('name');
      expect(required).not.toContain('role');
    });
  });

  // ---- nullable ----

  describe('nullable', () => {
    it('adds nullable: true for z.string().nullable()', () => {
      const result = adapter.extractJsonSchema(z.string().nullable());
      expect(result['nullable']).toBe(true);
    });

    it('preserves the inner type when nullable', () => {
      const result = adapter.extractJsonSchema(z.number().nullable());
      expect(result['type']).toBe('number');
      expect(result['nullable']).toBe(true);
    });
  });

  // ---- union types ----

  describe('union types', () => {
    it('converts z.union() to { anyOf: [...] }', () => {
      const result = adapter.extractJsonSchema(z.union([z.string(), z.number()]));
      const anyOf = result['anyOf'] as Record<string, unknown>[];
      expect(anyOf).toHaveLength(2);
      expect(anyOf[0]['type']).toBe('string');
      expect(anyOf[1]['type']).toBe('number');
    });
  });

  // ---- literal ----

  describe('literal', () => {
    it('converts z.literal("active") to { type: "string", const: "active" }', () => {
      const result = adapter.extractJsonSchema(z.literal('active'));
      expect(result['type']).toBe('string');
      expect(result['const']).toBe('active');
    });

    it('converts z.literal(42) to { type: "number", const: 42 }', () => {
      const result = adapter.extractJsonSchema(z.literal(42));
      expect(result['type']).toBe('number');
      expect(result['const']).toBe(42);
    });

    it('converts z.literal(true) to { type: "boolean", const: true }', () => {
      const result = adapter.extractJsonSchema(z.literal(true));
      expect(result['type']).toBe('boolean');
      expect(result['const']).toBe(true);
    });
  });

  // ---- record ----

  describe('record', () => {
    it('converts z.record(z.string()) to object with additionalProperties', () => {
      const result = adapter.extractJsonSchema(z.record(z.string(), z.number()));
      expect(result['type']).toBe('object');
      const additionalProps = result['additionalProperties'] as Record<string, unknown>;
      expect(additionalProps['type']).toBe('number');
    });
  });

  // ---- effects (refine/transform) ----

  describe('effects (refine/transform)', () => {
    it('unwraps refined schemas to the inner type', () => {
      const schema = z.string().refine((s) => s.length > 0);
      const result = adapter.extractJsonSchema(schema);
      expect(result['type']).toBe('string');
    });
  });

  // ---- extract() returns TSchema-compatible ----

  describe('extract()', () => {
    it('returns an object with type property for primitives', () => {
      const result = adapter.extract(z.string());
      expect((result as Record<string, unknown>)['type']).toBe('string');
    });

    it('returns an object with type "object" for Zod objects', () => {
      const schema = z.object({ name: z.string() });
      const result = adapter.extract(schema);
      expect((result as Record<string, unknown>)['type']).toBe('object');
    });
  });
});
