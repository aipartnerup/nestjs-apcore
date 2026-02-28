// Re-export upstream types from apcore-js
export type {
  ModuleAnnotations,
  ModuleExample,
  Module,
  Context,
  Identity,
  ModuleDescriptor,
} from 'apcore-js';

// ---------------------------------------------------------------------------
// Annotation / option types for decorators and module configuration
// ---------------------------------------------------------------------------

/** Annotations describing tool behavior characteristics. */
export interface ApToolAnnotations {
  readonly?: boolean;
  destructive?: boolean;
  idempotent?: boolean;
  requiresApproval?: boolean;
  openWorld?: boolean;
  streaming?: boolean;
}

/** Example entry for a tool invocation. */
export interface ApToolExample {
  title: string;
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
  description?: string;
}

/** Options accepted by the @ApTool decorator. */
export interface ApToolOptions {
  description: string;
  id?: string | null;
  inputSchema?: unknown | null;
  outputSchema?: unknown | null;
  annotations?: ApToolAnnotations | null;
  tags?: string[];
  documentation?: string | null;
  examples?: ApToolExample[];
}

/** Options accepted by the @ApModule decorator. */
export interface ApModuleOptions {
  namespace: string;
  description?: string | null;
  tags?: string[];
  annotations?: ApToolAnnotations | null;
}

// ---------------------------------------------------------------------------
// NestJS dynamic-module option types
// ---------------------------------------------------------------------------

/** Options for ApcoreModule.forRoot(). */
export interface ApcoreModuleOptions {
  extensionsDir?: string | null;
  acl?: unknown | null;
  middleware?: unknown[];
  bindings?: string | null;
  schema?: {
    adapters?: string[];
    strictOutput?: boolean;
  };
}

/** Async options for ApcoreModule.forRootAsync(). */
export interface ApcoreModuleAsyncOptions {
  imports?: unknown[];
  useFactory: (
    ...args: unknown[]
  ) => Promise<ApcoreModuleOptions> | ApcoreModuleOptions;
  inject?: unknown[];
}

/** Options for ApcoreMcpModule.forRoot(). */
export interface ApcoreMcpModuleOptions {
  transport?: 'stdio' | 'streamable-http' | 'sse';
  host?: string;
  port?: number;
  name?: string;
  version?: string;
  tags?: string[] | null;
  prefix?: string | null;
  explorer?: boolean;
  explorerPrefix?: string;
  allowExecute?: boolean;
  dynamic?: boolean;
  validateInputs?: boolean;
  logLevel?: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  onStartup?: () => void | Promise<void>;
  onShutdown?: () => void | Promise<void>;
  metricsCollector?: { exportPrometheus(): string };
  authenticator?: import('apcore-mcp').Authenticator;
  exemptPaths?: string[];
}

/** Async options for ApcoreMcpModule.forRootAsync(). */
export interface ApcoreMcpModuleAsyncOptions {
  imports?: unknown[];
  useFactory: (
    ...args: unknown[]
  ) => Promise<ApcoreMcpModuleOptions> | ApcoreMcpModuleOptions;
  inject?: unknown[];
}

// ---------------------------------------------------------------------------
// Internal registration types used by the scanning / bridging layer
// ---------------------------------------------------------------------------

/** Options for registering a single method as an apcore module. */
export interface RegisterMethodOptions {
  instance: object;
  method: string;
  description: string;
  id?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: ApToolAnnotations;
  tags?: string[];
  documentation?: string | null;
  examples?: ApToolExample[];
}

/** Options for registering an entire service (multiple methods) at once. */
export interface RegisterServiceOptions {
  instance: object;
  description?: string;
  methods: string[] | '*';
  exclude?: string[];
  namespace?: string;
  annotations?: ApToolAnnotations;
  tags?: string[];
  methodOptions?: Record<string, Partial<RegisterMethodOptions>>;
}
