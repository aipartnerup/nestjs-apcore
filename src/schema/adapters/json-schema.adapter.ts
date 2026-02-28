import type { TSchema } from '@sinclair/typebox';
import type { SchemaAdapter } from './schema-adapter.interface.js';

/** Well-known symbol used by @sinclair/typebox to tag its schema objects. */
const TYPEBOX_KIND = Symbol.for('TypeBox.Kind');

/**
 * Schema adapter for plain JSON Schema objects.
 *
 * JSON Schema is structurally compatible with TypeBox's `TSchema`, so
 * conversion is a straightforward deep clone via JSON round-trip.
 */
export class JsonSchemaAdapter implements SchemaAdapter {
  readonly name = 'json-schema' as const;
  readonly priority = 30;

  /**
   * Returns `true` when `input` is a non-null object that carries a `"type"`
   * property **and** is not already a TypeBox schema (identified by the
   * `Symbol.for('TypeBox.Kind')` symbol key).
   */
  detect(input: unknown): boolean {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      return false;
    }

    const obj = input as Record<string | symbol, unknown>;

    // Must have a "type" property to look like a JSON Schema
    if (!('type' in obj)) {
      return false;
    }

    // Reject TypeBox schemas — they are handled by the TypeBox adapter
    if (TYPEBOX_KIND in obj) {
      return false;
    }

    return true;
  }

  /**
   * Deep-clone the JSON Schema via `JSON.parse(JSON.stringify())`.
   *
   * Because JSON Schema is structurally compatible with TypeBox's `TSchema`,
   * the clone can be returned directly.
   */
  extract(input: unknown): TSchema {
    return JSON.parse(JSON.stringify(input)) as TSchema;
  }

  /**
   * Deep-clone the JSON Schema via `JSON.parse(JSON.stringify())`.
   */
  extractJsonSchema(input: unknown): Record<string, unknown> {
    return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  }
}
