import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { Type as t } from '@sinclair/typebox';
import type { TSchema } from '@sinclair/typebox';
import { FunctionModule } from 'apcore-js';
import { ApcoreRegistryService } from '../core/apcore-registry.service.js';
import { SchemaExtractor } from '../schema/schema-extractor.service.js';
import {
  AP_TOOL_METADATA_KEY,
  AP_MODULE_METADATA_KEY,
  AP_CONTEXT_METADATA_KEY,
} from '../constants.js';
import {
  normalizeClassName,
  normalizeMethodName,
  generateModuleId,
} from '../utils/id-generator.js';
import type { ApToolOptions, ApModuleOptions } from '../types.js';

/**
 * Normalize a method return value to a Record<string, unknown>.
 *
 * - null / undefined -> {}
 * - non-object (string, number, boolean, array) -> { result: value }
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
 * Try to extract a TSchema from the given input using SchemaExtractor.
 * Falls back to the raw value if extraction fails.
 */
function tryExtractSchema(
  extractor: SchemaExtractor,
  input: unknown,
): TSchema {
  try {
    return extractor.extract(input);
  } catch {
    return input as TSchema;
  }
}

/**
 * NestJS service that auto-discovers and registers `@ApTool` decorated
 * methods at module initialization time.
 *
 * Iterates all providers in all NestJS modules via `ModulesContainer`,
 * reads decorator metadata, and registers each decorated method as a
 * module in the `ApcoreRegistryService`.
 */
@Injectable()
export class ApToolScannerService implements OnModuleInit {
  private readonly schemaExtractor = new SchemaExtractor();

  constructor(
    @Inject(ApcoreRegistryService)
    private readonly registry: ApcoreRegistryService,
    @Inject(ModulesContainer)
    private readonly modulesContainer: ModulesContainer,
  ) {}

  onModuleInit(): void {
    this.scan();
  }

  /**
   * Scan all NestJS providers for @ApTool decorated methods and register
   * them in the apcore registry.
   */
  private scan(): void {
    for (const nestModule of this.modulesContainer.values()) {
      for (const wrapper of nestModule.providers.values()) {
        const instance = wrapper.instance;
        const metatype = wrapper.metatype;

        // Skip providers without a real instance or metatype (e.g. value providers)
        if (!instance || !metatype || typeof metatype !== 'function') {
          continue;
        }

        this.scanProvider(instance, metatype as new (...args: any[]) => any);
      }
    }
  }

  /**
   * Scan a single provider instance for @ApTool decorated methods.
   */
  private scanProvider(
    instance: object,
    metatype: new (...args: any[]) => any,
  ): void {
    // Read @ApModule metadata from the class (if any) to get namespace
    const moduleOptions: ApModuleOptions | undefined =
      Reflect.getMetadata(AP_MODULE_METADATA_KEY, metatype);

    const namespace =
      moduleOptions?.namespace ?? normalizeClassName(metatype.name);

    // Iterate all methods on the prototype
    const prototype = Object.getPrototypeOf(instance) as object;
    if (!prototype) return;

    const methodNames = Object.getOwnPropertyNames(prototype).filter(
      (name) => {
        if (name === 'constructor') return false;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        // Only include actual methods (not getters/setters)
        return descriptor !== undefined && typeof descriptor.value === 'function';
      },
    );

    for (const methodName of methodNames) {
      // Check for @ApTool metadata on this method
      const toolOptions: ApToolOptions | undefined = Reflect.getMetadata(
        AP_TOOL_METADATA_KEY,
        prototype,
        methodName,
      );

      if (!toolOptions) continue;

      // Read @ApContext metadata (parameter index) if present
      const contextIndex: number | undefined = Reflect.getMetadata(
        AP_CONTEXT_METADATA_KEY,
        prototype,
        methodName,
      );

      // Generate module ID
      const normalizedMethod = normalizeMethodName(methodName);
      const moduleId: string =
        toolOptions.id ?? generateModuleId(namespace, normalizedMethod);

      // Extract schemas via SchemaExtractor (try/catch, use raw on failure)
      let inputSchema: TSchema = t.Object({});
      let outputSchema: TSchema = t.Object({});

      if (toolOptions.inputSchema != null) {
        inputSchema = tryExtractSchema(
          this.schemaExtractor,
          toolOptions.inputSchema,
        );
      }

      if (toolOptions.outputSchema != null) {
        outputSchema = tryExtractSchema(
          this.schemaExtractor,
          toolOptions.outputSchema,
        );
      }

      // Build the execute function
      const fn = (instance as Record<string, Function>)[methodName]!;

      const execute = async (
        inputs: Record<string, unknown>,
        context: unknown,
      ): Promise<Record<string, unknown>> => {
        let raw: unknown;

        if (contextIndex != null) {
          const args: unknown[] = [];
          if (contextIndex === 0) {
            args[0] = context;
            args[1] = inputs;
          } else {
            args[0] = inputs;
            args[contextIndex] = context;
          }
          raw = await fn.call(instance, ...args);
        } else {
          raw = await fn.call(instance, inputs);
        }

        return normalizeReturnValue(raw);
      };

      const funcModule = new FunctionModule({
        moduleId,
        description: toolOptions.description,
        inputSchema,
        outputSchema,
        tags: toolOptions.tags ?? null,
        annotations: (toolOptions.annotations as unknown as FunctionModule['annotations']) ?? null,
        documentation: toolOptions.documentation ?? null,
        examples: toolOptions.examples ?? null,
        execute,
      });

      this.registry.register(moduleId, funcModule);
    }
  }
}
