import { Injectable, Inject } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { serve, toOpenaiTools } from 'apcore-mcp';
import type { OpenAIToolDef } from 'apcore-mcp';
import { ApcoreRegistryService } from '../core/apcore-registry.service.js';
import { ApcoreExecutorService } from '../core/apcore-executor.service.js';
import { APCORE_MCP_MODULE_OPTIONS } from '../constants.js';
import type { ApcoreMcpModuleOptions } from '../types.js';

/**
 * NestJS service that manages the MCP (Model Context Protocol) server lifecycle.
 *
 * Wraps the `serve()` and `toOpenaiTools()` functions from `apcore-mcp`,
 * integrating them with NestJS lifecycle hooks for automatic startup/shutdown.
 */
@Injectable()
export class ApcoreMcpService implements OnApplicationBootstrap, OnModuleDestroy {
  private _isRunning = false;

  constructor(
    @Inject(ApcoreRegistryService)
    private readonly registry: ApcoreRegistryService,
    @Inject(ApcoreExecutorService)
    private readonly executor: ApcoreExecutorService,
    @Inject(APCORE_MCP_MODULE_OPTIONS)
    private readonly options: ApcoreMcpModuleOptions,
  ) {}

  // -----------------------------------------------------------------------
  // Properties
  // -----------------------------------------------------------------------

  /** Whether the MCP server is currently running. */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Number of tools available in the registry, filtered by the module-level
   * `tags` and `prefix` options when provided.
   */
  get toolCount(): number {
    return this.registry.list({
      tags: this.options.tags ?? undefined,
      prefix: this.options.prefix ?? undefined,
    }).length;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Starts the MCP server using the configured transport and options. */
  async start(): Promise<void> {
    this._isRunning = true;

    const serveOptions: Record<string, unknown> = {};

    // Forward all relevant options to serve()
    if (this.options.transport !== undefined) serveOptions.transport = this.options.transport;
    if (this.options.host !== undefined) serveOptions.host = this.options.host;
    if (this.options.port !== undefined) serveOptions.port = this.options.port;
    if (this.options.name !== undefined) serveOptions.name = this.options.name;
    if (this.options.version !== undefined) serveOptions.version = this.options.version;
    if (this.options.tags !== undefined) serveOptions.tags = this.options.tags;
    if (this.options.prefix !== undefined) serveOptions.prefix = this.options.prefix;
    if (this.options.explorer !== undefined) serveOptions.explorer = this.options.explorer;
    if (this.options.explorerPrefix !== undefined) serveOptions.explorerPrefix = this.options.explorerPrefix;
    if (this.options.allowExecute !== undefined) serveOptions.allowExecute = this.options.allowExecute;
    if (this.options.dynamic !== undefined) serveOptions.dynamic = this.options.dynamic;
    if (this.options.validateInputs !== undefined) serveOptions.validateInputs = this.options.validateInputs;
    if (this.options.logLevel !== undefined) serveOptions.logLevel = this.options.logLevel;
    if (this.options.onStartup !== undefined) serveOptions.onStartup = this.options.onStartup;
    if (this.options.onShutdown !== undefined) serveOptions.onShutdown = this.options.onShutdown;
    if (this.options.metricsCollector !== undefined) serveOptions.metricsCollector = this.options.metricsCollector;
    if (this.options.authenticator !== undefined) serveOptions.authenticator = this.options.authenticator;
    if (this.options.exemptPaths !== undefined) serveOptions.exemptPaths = this.options.exemptPaths;

    await serve(this.executor.raw, serveOptions);
  }

  /** Stops the MCP server. */
  async stop(): Promise<void> {
    this._isRunning = false;
  }

  /** Restarts the MCP server (stop, then start). */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  // -----------------------------------------------------------------------
  // Tool conversion
  // -----------------------------------------------------------------------

  /**
   * Convert the registered tools to OpenAI-compatible tool definitions.
   *
   * Delegates to `toOpenaiTools()` from `apcore-mcp`.
   */
  toOpenaiTools(options?: {
    embedAnnotations?: boolean;
    strict?: boolean;
    tags?: string[];
    prefix?: string;
  }): OpenAIToolDef[] {
    return toOpenaiTools(this.executor.raw, options);
  }

  // -----------------------------------------------------------------------
  // NestJS lifecycle hooks
  // -----------------------------------------------------------------------

  /**
   * Auto-starts the MCP server when a transport is configured.
   *
   * Uses `OnApplicationBootstrap` (not `OnModuleInit`) so that all
   * tools registered via decorators, programmatic calls, or YAML
   * bindings during `onModuleInit` are available before the server starts.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (this.options.transport) {
      await this.start();
    }
  }

  /** Auto-stops the MCP server on module destruction. */
  async onModuleDestroy(): Promise<void> {
    if (this._isRunning) {
      await this.stop();
    }
  }
}
