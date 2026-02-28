import { Type } from '@sinclair/typebox';
import { TypeBoxAdapter } from '../../src/schema/adapters/typebox.adapter.js';
import type { SchemaAdapter } from '../../src/schema/adapters/schema-adapter.interface.js';

// ---------------------------------------------------------------------------
// Tests: TypeBoxAdapter
// ---------------------------------------------------------------------------

describe('TypeBoxAdapter', () => {
  let adapter: SchemaAdapter;

  beforeEach(() => {
    adapter = new TypeBoxAdapter();
  });

  // ---- metadata ----

  describe('metadata', () => {
    it('has name "typebox"', () => {
      expect(adapter.name).toBe('typebox');
    });

    it('has priority 100', () => {
      expect(adapter.priority).toBe(100);
    });
  });

  // ---- detect() ----

  describe('detect()', () => {
    it('detects Type.Object schemas', () => {
      const schema = Type.Object({ name: Type.String() });
      expect(adapter.detect(schema)).toBe(true);
    });

    it('detects Type.String schemas', () => {
      const schema = Type.String();
      expect(adapter.detect(schema)).toBe(true);
    });

    it('detects Type.Number schemas', () => {
      const schema = Type.Number();
      expect(adapter.detect(schema)).toBe(true);
    });

    it('detects Type.Boolean schemas', () => {
      const schema = Type.Boolean();
      expect(adapter.detect(schema)).toBe(true);
    });

    it('detects Type.Array schemas', () => {
      const schema = Type.Array(Type.String());
      expect(adapter.detect(schema)).toBe(true);
    });

    it('does not detect plain objects', () => {
      expect(adapter.detect({ type: 'object', properties: {} })).toBe(false);
    });

    it('does not detect null', () => {
      expect(adapter.detect(null)).toBe(false);
    });

    it('does not detect undefined', () => {
      expect(adapter.detect(undefined)).toBe(false);
    });

    it('does not detect strings', () => {
      expect(adapter.detect('hello')).toBe(false);
    });

    it('does not detect numbers', () => {
      expect(adapter.detect(42)).toBe(false);
    });

    it('does not detect arrays', () => {
      expect(adapter.detect([1, 2, 3])).toBe(false);
    });

    it('does not detect Zod-like schemas', () => {
      // Mock a Zod-like object (has _def and safeParse, but no TypeBox.Kind)
      const zodLike = {
        _def: { typeName: 'ZodString' },
        safeParse: () => ({ success: true }),
        parse: () => 'value',
      };
      expect(adapter.detect(zodLike)).toBe(false);
    });
  });

  // ---- extract() ----

  describe('extract()', () => {
    it('returns the original TypeBox schema (preserving Symbol keys)', () => {
      const schema = Type.Object({ name: Type.String() });
      const extracted = adapter.extract(schema);
      // Must be the same reference so TypeBox Symbol keys are preserved
      // for runtime validation (e.g. Value.Check())
      expect(extracted).toBe(schema);
    });

    it('preserves nested structure', () => {
      const schema = Type.Object({
        user: Type.Object({
          name: Type.String(),
          age: Type.Number(),
        }),
        tags: Type.Array(Type.String()),
      });
      const extracted = adapter.extract(schema);
      expect(extracted).toBe(schema);
      const obj = extracted as Record<string, unknown>;
      expect(obj['type']).toBe('object');
      const props = obj['properties'] as Record<string, Record<string, unknown>>;
      expect(props['user']['type']).toBe('object');
      expect(props['tags']['type']).toBe('array');
    });

    it('preserves TypeBox Symbol keys for runtime validation', () => {
      const schema = Type.Object({ name: Type.String() });
      const extracted = adapter.extract(schema);
      const KIND = Symbol.for('TypeBox.Kind');
      expect(KIND in (extracted as Record<symbol, unknown>)).toBe(true);
    });
  });

  // ---- extractJsonSchema() ----

  describe('extractJsonSchema()', () => {
    it('returns a plain object with type and properties', () => {
      const schema = Type.Object({
        name: Type.String(),
        age: Type.Number(),
      });
      const jsonSchema = adapter.extractJsonSchema(schema);

      expect(jsonSchema['type']).toBe('object');
      expect(jsonSchema['properties']).toBeDefined();

      const props = jsonSchema['properties'] as Record<string, unknown>;
      expect(props['name']).toBeDefined();
      expect(props['age']).toBeDefined();
    });

    it('strips TypeBox symbol properties via JSON serialization', () => {
      const schema = Type.String();
      const jsonSchema = adapter.extractJsonSchema(schema);

      // The result should be a plain JSON object without Symbol keys
      const symbolKeys = Object.getOwnPropertySymbols(jsonSchema);
      expect(symbolKeys).toHaveLength(0);
    });

    it('returns a different reference than the input', () => {
      const schema = Type.Object({ x: Type.Number() });
      const jsonSchema = adapter.extractJsonSchema(schema);
      expect(jsonSchema).not.toBe(schema);
    });

    it('preserves required array for Type.Object', () => {
      const schema = Type.Object({
        name: Type.String(),
        age: Type.Number(),
      });
      const jsonSchema = adapter.extractJsonSchema(schema);

      expect(jsonSchema['required']).toBeDefined();
      expect(jsonSchema['required']).toContain('name');
      expect(jsonSchema['required']).toContain('age');
    });
  });
});
