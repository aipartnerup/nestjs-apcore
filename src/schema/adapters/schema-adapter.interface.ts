import type { TSchema } from '@sinclair/typebox';

/**
 * Contract for pluggable schema adapters.
 *
 * Each adapter knows how to detect a specific schema dialect (TypeBox, JSON
 * Schema, Zod, class-validator DTO, etc.) and convert it into the canonical
 * representations used by the framework.
 */
export interface SchemaAdapter {
  /** Human-readable adapter name, e.g. 'typebox' or 'json-schema'. */
  readonly name: string;

  /** Lower priority wins — adapters are tried in ascending priority order. */
  readonly priority: number;

  /** Return `true` when `input` is a schema this adapter can handle. */
  detect(input: unknown): boolean;

  /** Convert `input` into a TypeBox-compatible `TSchema` object. */
  extract(input: unknown): TSchema;

  /** Convert `input` into a plain JSON Schema object. */
  extractJsonSchema(input: unknown): Record<string, unknown>;
}
