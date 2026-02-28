import type { TSchema } from '@sinclair/typebox';
import type { SchemaAdapter } from './adapters/schema-adapter.interface.js';
import { TypeBoxAdapter } from './adapters/typebox.adapter.js';
import { ZodAdapter } from './adapters/zod.adapter.js';
import { JsonSchemaAdapter } from './adapters/json-schema.adapter.js';
import { DtoAdapter } from './adapters/dto.adapter.js';

/**
 * Thrown when no registered adapter is able to handle the provided input.
 */
export class SchemaExtractionError extends Error {
  override readonly name = 'SchemaExtractionError';

  constructor(message: string) {
    super(message);
    // Restore prototype chain (needed when targeting ES5 or when extending built-ins)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Orchestrator service that delegates schema detection, extraction, and
 * JSON Schema conversion to a prioritised chain of {@link SchemaAdapter}s.
 *
 * Built-in adapters (tried in descending priority order):
 *
 * | Adapter            | Priority |
 * |--------------------|----------|
 * | TypeBoxAdapter     | 100      |
 * | ZodAdapter         | 50       |
 * | JsonSchemaAdapter  | 30       |
 * | DtoAdapter         | 20       |
 *
 * Custom adapters can be added via {@link registerAdapter} and will be
 * inserted into the chain according to their priority value (highest first).
 */
export class SchemaExtractor {
  private adapters: SchemaAdapter[];

  constructor() {
    this.adapters = [
      new TypeBoxAdapter(),
      new ZodAdapter(),
      new JsonSchemaAdapter(),
      new DtoAdapter(),
    ];
    this.sortAdapters();
  }

  /**
   * Register a custom adapter and re-sort the adapter chain by priority
   * (highest first).
   */
  registerAdapter(adapter: SchemaAdapter): void {
    this.adapters.push(adapter);
    this.sortAdapters();
  }

  /**
   * Returns the name of the first adapter whose `detect()` returns `true`
   * for the given input, or `null` if no adapter matches.
   */
  detect(input: unknown): string | null {
    for (const adapter of this.adapters) {
      if (adapter.detect(input)) {
        return adapter.name;
      }
    }
    return null;
  }

  /**
   * Extracts a TypeBox-compatible `TSchema` from the given input using the
   * first matching adapter.
   *
   * @throws {SchemaExtractionError} If no adapter can handle the input.
   */
  extract(input: unknown): TSchema {
    for (const adapter of this.adapters) {
      if (adapter.detect(input)) {
        return adapter.extract(input);
      }
    }
    throw new SchemaExtractionError(
      'No adapter matched the provided input. ' +
        'Ensure the input is a valid TypeBox, Zod, JSON Schema, or class-validator DTO schema.',
    );
  }

  /**
   * Extracts a plain JSON Schema object from the given input using the
   * first matching adapter.
   *
   * @throws {SchemaExtractionError} If no adapter can handle the input.
   */
  extractJsonSchema(input: unknown): Record<string, unknown> {
    for (const adapter of this.adapters) {
      if (adapter.detect(input)) {
        return adapter.extractJsonSchema(input);
      }
    }
    throw new SchemaExtractionError(
      'No adapter matched the provided input. ' +
        'Ensure the input is a valid TypeBox, Zod, JSON Schema, or class-validator DTO schema.',
    );
  }

  /**
   * Sort adapters in descending priority order (highest priority first).
   */
  private sortAdapters(): void {
    this.adapters.sort((a, b) => b.priority - a.priority);
  }
}
