import { Module } from '@nestjs/common';
import type { DynamicModule, InjectionToken } from '@nestjs/common';
import { ApcoreRegistryService } from '../core/apcore-registry.service.js';
import { ApcoreExecutorService } from '../core/apcore-executor.service.js';
import { ApcoreMcpService } from './apcore-mcp.service.js';
import { APCORE_MCP_MODULE_OPTIONS } from '../constants.js';
import type {
  ApcoreMcpModuleOptions,
  ApcoreMcpModuleAsyncOptions,
} from '../types.js';

/**
 * NestJS dynamic module for the MCP (Model Context Protocol) server.
 *
 * Provides {@link ApcoreMcpService} and the {@link APCORE_MCP_MODULE_OPTIONS}
 * token. Requires that {@link ApcoreRegistryService} and
 * {@link ApcoreExecutorService} are available in the injection context
 * (typically via importing `ApcoreModule`).
 */
@Module({})
export class ApcoreMcpModule {
  /**
   * Synchronous configuration.
   *
   * Creates the {@link ApcoreMcpService} via a factory that injects
   * {@link ApcoreRegistryService} and {@link ApcoreExecutorService}
   * from the parent context.
   */
  static forRoot(options: ApcoreMcpModuleOptions): DynamicModule {
    return {
      module: ApcoreMcpModule,
      providers: [
        { provide: APCORE_MCP_MODULE_OPTIONS, useValue: options },
        {
          provide: ApcoreMcpService,
          useFactory: (
            registry: ApcoreRegistryService,
            executor: ApcoreExecutorService,
          ) => new ApcoreMcpService(registry, executor, options),
          inject: [ApcoreRegistryService, ApcoreExecutorService],
        },
      ],
      exports: [ApcoreMcpService, APCORE_MCP_MODULE_OPTIONS],
    };
  }

  /**
   * Asynchronous configuration using the `useFactory` / `inject` pattern.
   *
   * Supports an `imports` array so that injected dependencies (e.g. a
   * ConfigService) are available to the factory function.
   */
  static forRootAsync(options: ApcoreMcpModuleAsyncOptions): DynamicModule {
    return {
      module: ApcoreMcpModule,
      imports: (options.imports ?? []) as DynamicModule[],
      providers: [
        {
          provide: APCORE_MCP_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: (options.inject ?? []) as InjectionToken[],
        },
        {
          provide: ApcoreMcpService,
          useFactory: (
            opts: ApcoreMcpModuleOptions,
            registry: ApcoreRegistryService,
            executor: ApcoreExecutorService,
          ) => new ApcoreMcpService(registry, executor, opts),
          inject: [
            APCORE_MCP_MODULE_OPTIONS,
            ApcoreRegistryService,
            ApcoreExecutorService,
          ],
        },
      ],
      exports: [ApcoreMcpService, APCORE_MCP_MODULE_OPTIONS],
    };
  }
}
