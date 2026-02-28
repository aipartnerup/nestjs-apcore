import { Injectable } from '@nestjs/common';
import { Type as t } from '@sinclair/typebox';
import type { TSchema } from '@sinclair/typebox';
import { FunctionModule } from 'apcore-js';
import type { Registry } from 'apcore-js';
import type { ModuleDescriptor } from 'apcore-js';
import type { RegisterMethodOptions, RegisterServiceOptions } from '../types.js';
import {
  normalizeClassName,
  normalizeMethodName,
  generateModuleId,
} from '../utils/id-generator.js';

/**
 * Normalize a method return value to a Record<string, unknown>.
 *
 * - null / undefined -> {}
 * - non-object (string, number, boolean) -> { result: value }
 * - object -> returned as-is
 */
function normalizeReturnValue(value: unknown): Record<string, unknown> {
  if (value == null) {
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { result: value };
  }
  return value as Record<string, unknown>;
}

/**
 * Collect all own method names from a prototype chain up to (but not
 * including) Object.prototype. Excludes 'constructor'.
 */
function getAllMethodNames(instance: object): string[] {
  const methods = new Set<string>();
  let proto: object | null = Object.getPrototypeOf(instance) as object | null;

  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (
        name !== 'constructor' &&
        typeof (proto as Record<string, unknown>)[name] === 'function'
      ) {
        methods.add(name);
      }
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }

  return [...methods];
}

/**
 * NestJS-injectable service that wraps an upstream apcore-js Registry,
 * delegating core operations and adding convenience methods for
 * registering NestJS service methods as FunctionModules.
 */
@Injectable()
export class ApcoreRegistryService {
  constructor(private readonly registry: Registry) {}

  // ---- raw access ----

  /** Return the underlying apcore-js Registry instance. */
  get raw(): Registry {
    return this.registry;
  }

  // ---- delegated methods ----

  register(moduleId: string, module: unknown): void {
    this.registry.register(moduleId, module);
  }

  unregister(moduleId: string): boolean {
    return this.registry.unregister(moduleId);
  }

  get(moduleId: string): unknown | null {
    return this.registry.get(moduleId);
  }

  has(moduleId: string): boolean {
    return this.registry.has(moduleId);
  }

  list(options?: { tags?: string[]; prefix?: string }): string[] {
    return this.registry.list(options);
  }

  getDefinition(moduleId: string): ModuleDescriptor | null {
    return this.registry.getDefinition(moduleId);
  }

  on(
    event: string,
    callback: (moduleId: string, module: unknown) => void,
  ): void {
    this.registry.on(event, callback);
  }

  discover(): Promise<number> {
    return this.registry.discover();
  }

  get count(): number {
    return this.registry.count;
  }

  // ---- NestJS convenience methods ----

  /**
   * Register a single method from a service instance as a FunctionModule.
   *
   * Generates a module ID from the class name + method name when no
   * explicit id is provided (e.g. EmailService.sendEmail -> email.send_email).
   *
   * The execute function calls the method on the bound instance and
   * normalizes the return value:
   *   - null / undefined -> {}
   *   - non-object -> { result: value }
   *   - object -> returned as-is
   *
   * @returns The module ID under which the method was registered.
   */
  registerMethod(options: RegisterMethodOptions): string {
    const {
      instance,
      method,
      description,
      id,
      inputSchema,
      outputSchema,
      annotations,
      tags,
      documentation,
      examples,
    } = options;

    // Validate the method exists on the instance
    const fn = (instance as Record<string, unknown>)[method];
    if (typeof fn !== 'function') {
      throw new Error(
        `Method "${method}" does not exist on ${instance.constructor.name}`,
      );
    }

    const className = instance.constructor.name;
    const moduleId = generateModuleId(className, method, true, id);

    const funcModule = new FunctionModule({
      moduleId,
      description,
      inputSchema: (inputSchema as TSchema) ?? t.Object({}),
      outputSchema: (outputSchema as TSchema) ?? t.Object({}),
      tags: tags ?? null,
      annotations: annotations as FunctionModule['annotations'],
      documentation: documentation ?? null,
      examples: examples ?? null,
      execute: async (inputs) => {
        const raw = await (fn as Function).call(instance, inputs);
        return normalizeReturnValue(raw);
      },
    });

    this.registry.register(moduleId, funcModule);
    return moduleId;
  }

  /**
   * Register multiple methods from a service instance as FunctionModules.
   *
   * When `methods` is `'*'`, all public methods are discovered via
   * prototype inspection (excluding 'constructor' and any names in the
   * `exclude` array).
   *
   * @returns An array of module IDs that were registered.
   */
  registerService(options: RegisterServiceOptions): string[] {
    const {
      instance,
      description,
      methods,
      exclude = [],
      namespace,
      annotations,
      tags,
      methodOptions = {},
    } = options;

    // Determine which methods to register
    let methodNames: string[];

    if (methods === '*') {
      methodNames = getAllMethodNames(instance).filter(
        (name) => !exclude.includes(name),
      );
    } else {
      methodNames = methods.filter((name) => !exclude.includes(name));
    }

    const registeredIds: string[] = [];

    for (const methodName of methodNames) {
      const perMethodOpts = methodOptions[methodName] ?? {};

      // Build the namespace: explicit namespace > normalized class name
      const ns =
        namespace ?? normalizeClassName(instance.constructor.name);
      const normalizedMethod = normalizeMethodName(methodName);

      const methodDesc =
        perMethodOpts.description ?? description ?? `${methodName}`;

      const moduleId = perMethodOpts.id ?? `${ns}.${normalizedMethod}`;

      const id = this.registerMethod({
        instance,
        method: methodName,
        description: methodDesc,
        id: moduleId,
        inputSchema: perMethodOpts.inputSchema,
        outputSchema: perMethodOpts.outputSchema,
        annotations: perMethodOpts.annotations ?? annotations,
        tags: perMethodOpts.tags ?? tags,
        documentation: perMethodOpts.documentation,
        examples: perMethodOpts.examples,
      });

      registeredIds.push(id);
    }

    return registeredIds;
  }
}
