import { Type } from '@sinclair/typebox';
import { JsonSchemaAdapter } from '../../src/schema/adapters/json-schema.adapter.js';

describe('JsonSchemaAdapter', () => {
  let adapter: JsonSchemaAdapter;

  beforeEach(() => {
    adapter = new JsonSchemaAdapter();
  });

  // -----------------------------------------------------------------------
  // Metadata
  // -----------------------------------------------------------------------
  it('has name "json-schema"', () => {
    expect(adapter.name).toBe('json-schema');
  });

  it('has priority 30', () => {
    expect(adapter.priority).toBe(30);
  });

  // -----------------------------------------------------------------------
  // detect()
  // -----------------------------------------------------------------------
  describe('detect()', () => {
    it('detects a plain JSON Schema object with a "type" property', () => {
      expect(adapter.detect({ type: 'object' })).toBe(true);
    });

    it('detects a JSON Schema string type', () => {
      expect(adapter.detect({ type: 'string', minLength: 1 })).toBe(true);
    });

    it('detects a JSON Schema with nested properties', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };
      expect(adapter.detect(schema)).toBe(true);
    });

    it('does not detect null', () => {
      expect(adapter.detect(null)).toBe(false);
    });

    it('does not detect undefined', () => {
      expect(adapter.detect(undefined)).toBe(false);
    });

    it('does not detect a string', () => {
      expect(adapter.detect('hello')).toBe(false);
    });

    it('does not detect a number', () => {
      expect(adapter.detect(42)).toBe(false);
    });

    it('does not detect a boolean', () => {
      expect(adapter.detect(true)).toBe(false);
    });

    it('does not detect an array', () => {
      expect(adapter.detect([1, 2, 3])).toBe(false);
    });

    it('does not detect an empty object (no "type" key)', () => {
      expect(adapter.detect({})).toBe(false);
    });

    it('does not detect an object without "type"', () => {
      expect(adapter.detect({ properties: { name: { type: 'string' } } })).toBe(false);
    });

    it('does not detect a TypeBox schema (has Symbol.for("TypeBox.Kind"))', () => {
      const typeboxSchema = Type.Object({
        name: Type.String(),
      });
      // Confirm it has the TypeBox symbol before testing
      expect(Symbol.for('TypeBox.Kind') in (typeboxSchema as unknown as Record<symbol, unknown>)).toBe(true);
      expect(adapter.detect(typeboxSchema)).toBe(false);
    });

    it('does not detect a TypeBox string schema', () => {
      const typeboxString = Type.String();
      expect(adapter.detect(typeboxString)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // extract()
  // -----------------------------------------------------------------------
  describe('extract()', () => {
    it('returns a TSchema-compatible deep clone', () => {
      const input = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };

      const result = adapter.extract(input);

      // Structurally identical
      expect(result).toEqual(input);
      // Different reference (deep clone)
      expect(result).not.toBe(input);
    });

    it('deep clones nested objects', () => {
      const nested = { type: 'string' };
      const input = {
        type: 'object',
        properties: { name: nested },
      };

      const result = adapter.extract(input) as Record<string, unknown>;
      const props = result['properties'] as Record<string, unknown>;

      expect(props['name']).toEqual(nested);
      expect(props['name']).not.toBe(nested);
    });
  });

  // -----------------------------------------------------------------------
  // extractJsonSchema()
  // -----------------------------------------------------------------------
  describe('extractJsonSchema()', () => {
    it('returns a deep clone of the input', () => {
      const input = {
        type: 'object',
        properties: {
          age: { type: 'integer', minimum: 0 },
        },
      };

      const result = adapter.extractJsonSchema(input);

      expect(result).toEqual(input);
      expect(result).not.toBe(input);
    });

    it('produces a structurally independent copy', () => {
      const input: Record<string, unknown> = {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'string' } },
        },
      };

      const result = adapter.extractJsonSchema(input);

      // Mutate the clone and verify original is untouched
      (result['properties'] as Record<string, unknown>)['extra'] = { type: 'boolean' };
      expect((input['properties'] as Record<string, unknown>)['extra']).toBeUndefined();
    });
  });
});
