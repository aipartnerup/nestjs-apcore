import type { TSchema } from '@sinclair/typebox';
import type { SchemaAdapter } from './schema-adapter.interface.js';

/**
 * Well-known TypeBox symbol used to tag every schema node.
 * We look up this symbol to detect TypeBox schemas without importing
 * the full library at detection time.
 */
const KIND = Symbol.for('TypeBox.Kind');

/**
 * Schema adapter for `@sinclair/typebox` schemas.
 *
 * TypeBox schemas are already valid JSON Schema objects decorated with
 * additional `Symbol` properties that the TypeBox runtime (e.g.
 * `Value.Check()`) relies on for validation.
 */
export class TypeBoxAdapter implements SchemaAdapter {
  readonly name = 'typebox' as const;
  readonly priority = 100;

  /**
   * Returns `true` when `input` is a TypeBox schema (carries `Symbol.for('TypeBox.Kind')`).
   */
  detect(input: unknown): boolean {
    if (input === null || input === undefined) return false;
    if (typeof input !== 'object') return false;
    return KIND in (input as object);
  }

  /**
   * Returns the TypeBox schema as-is. TypeBox schemas are immutable value
   * objects and must retain their `Symbol` keys for runtime validation
   * (e.g. `Value.Check()`).
   */
  extract(input: unknown): TSchema {
    return input as TSchema;
  }

  /**
   * Converts a TypeBox schema to a plain JSON Schema object.
   *
   * Because TypeBox IS JSON Schema (with extra symbol decorations),
   * a JSON round-trip effectively strips the symbols and returns
   * a standards-compliant JSON Schema object.
   */
  extractJsonSchema(input: unknown): Record<string, unknown> {
    return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  }
}
