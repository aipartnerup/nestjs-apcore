import { Injectable } from '@nestjs/common';
import type { Executor } from 'apcore-js';
import type { Context, ValidationResult } from 'apcore-js';

/**
 * NestJS-injectable wrapper around the upstream apcore-js {@link Executor}.
 *
 * All mutation-free delegation methods normalise `null` / `undefined` inputs
 * to an empty object (`{}`) so callers never need to worry about nullability.
 */
@Injectable()
export class ApcoreExecutorService {
  constructor(private readonly executor: Executor) {}

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Access the underlying apcore-js Executor directly. */
  get raw(): Executor {
    return this.executor;
  }

  /**
   * Execute a module by ID.
   *
   * @param moduleId  Fully-qualified module identifier (e.g. `"email.send"`).
   * @param inputs    Key/value inputs for the module.  `null` and `undefined`
   *                  are normalised to `{}`.
   * @param context   Optional execution context (identity, trace, etc.).
   */
  async call(
    moduleId: string,
    inputs?: Record<string, unknown> | null,
    context?: Context | null,
  ): Promise<Record<string, unknown>> {
    return this.executor.call(moduleId, inputs ?? {}, context);
  }

  /**
   * Stream execution results from a module.
   *
   * Yields each chunk produced by the upstream `executor.stream()` generator.
   *
   * @param moduleId  Fully-qualified module identifier.
   * @param inputs    Key/value inputs for the module.  `null` and `undefined`
   *                  are normalised to `{}`.
   * @param context   Optional execution context.
   */
  async *stream(
    moduleId: string,
    inputs?: Record<string, unknown> | null,
    context?: Context | null,
  ): AsyncGenerator<Record<string, unknown>> {
    yield* this.executor.stream(moduleId, inputs ?? {}, context);
  }

  /**
   * Validate inputs against a module's input schema without executing it.
   *
   * @param moduleId  Fully-qualified module identifier.
   * @param inputs    Key/value inputs to validate.
   */
  validate(
    moduleId: string,
    inputs: Record<string, unknown>,
  ): ValidationResult {
    return this.executor.validate(moduleId, inputs);
  }
}
