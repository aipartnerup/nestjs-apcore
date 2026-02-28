import { describe, it, expect } from 'vitest';

describe('Public API exports (src/index.ts)', () => {
  // Dynamic import so the test exercises the actual barrel file
  let api: Record<string, unknown>;

  beforeAll(async () => {
    api = await import('../src/index.js');
  });

  // ---- Core ----

  it('exports ApcoreModule', () => {
    expect(api.ApcoreModule).toBeDefined();
    expect(typeof api.ApcoreModule).toBe('function');
  });

  it('exports ApcoreRegistryService', () => {
    expect(api.ApcoreRegistryService).toBeDefined();
    expect(typeof api.ApcoreRegistryService).toBe('function');
  });

  it('exports ApcoreExecutorService', () => {
    expect(api.ApcoreExecutorService).toBeDefined();
    expect(typeof api.ApcoreExecutorService).toBe('function');
  });

  // ---- MCP ----

  it('exports ApcoreMcpModule', () => {
    expect(api.ApcoreMcpModule).toBeDefined();
    expect(typeof api.ApcoreMcpModule).toBe('function');
  });

  it('exports ApcoreMcpService', () => {
    expect(api.ApcoreMcpService).toBeDefined();
    expect(typeof api.ApcoreMcpService).toBe('function');
  });

  // ---- Decorators ----

  it('exports ApTool decorator', () => {
    expect(api.ApTool).toBeDefined();
    expect(typeof api.ApTool).toBe('function');
  });

  it('exports ApModule decorator', () => {
    expect(api.ApModule).toBeDefined();
    expect(typeof api.ApModule).toBe('function');
  });

  it('exports ApContext decorator', () => {
    expect(api.ApContext).toBeDefined();
    expect(typeof api.ApContext).toBe('function');
  });

  it('exports ApToolScannerService', () => {
    expect(api.ApToolScannerService).toBeDefined();
    expect(typeof api.ApToolScannerService).toBe('function');
  });

  // ---- Schema ----

  it('exports SchemaExtractor', () => {
    expect(api.SchemaExtractor).toBeDefined();
    expect(typeof api.SchemaExtractor).toBe('function');
  });

  it('exports SchemaExtractionError', () => {
    expect(api.SchemaExtractionError).toBeDefined();
    expect(typeof api.SchemaExtractionError).toBe('function');
  });

  it('exports TypeBoxAdapter', () => {
    expect(api.TypeBoxAdapter).toBeDefined();
    expect(typeof api.TypeBoxAdapter).toBe('function');
  });

  it('exports ZodAdapter', () => {
    expect(api.ZodAdapter).toBeDefined();
    expect(typeof api.ZodAdapter).toBe('function');
  });

  it('exports DtoAdapter', () => {
    expect(api.DtoAdapter).toBeDefined();
    expect(typeof api.DtoAdapter).toBe('function');
  });

  it('exports JsonSchemaAdapter', () => {
    expect(api.JsonSchemaAdapter).toBeDefined();
    expect(typeof api.JsonSchemaAdapter).toBe('function');
  });

  // SchemaAdapter is a type-only export; it should NOT appear at runtime
  it('does not export SchemaAdapter as a runtime value (type-only)', () => {
    expect(api.SchemaAdapter).toBeUndefined();
  });

  // ---- Bridge ----

  it('exports ApBindingLoader', () => {
    expect(api.ApBindingLoader).toBeDefined();
    expect(typeof api.ApBindingLoader).toBe('function');
  });

  // InstanceProvider is a type-only export; it should NOT appear at runtime
  it('does not export InstanceProvider as a runtime value (type-only)', () => {
    expect(api.InstanceProvider).toBeUndefined();
  });

  // ---- Utilities ----

  it('exports normalizeClassName', () => {
    expect(api.normalizeClassName).toBeDefined();
    expect(typeof api.normalizeClassName).toBe('function');
  });

  it('exports normalizeMethodName', () => {
    expect(api.normalizeMethodName).toBeDefined();
    expect(typeof api.normalizeMethodName).toBe('function');
  });

  it('exports generateModuleId', () => {
    expect(api.generateModuleId).toBeDefined();
    expect(typeof api.generateModuleId).toBe('function');
  });

  // ---- Constants ----

  it('exports APCORE_MODULE_OPTIONS', () => {
    expect(api.APCORE_MODULE_OPTIONS).toBe('APCORE_MODULE_OPTIONS');
  });

  it('exports APCORE_MCP_MODULE_OPTIONS', () => {
    expect(api.APCORE_MCP_MODULE_OPTIONS).toBe('APCORE_MCP_MODULE_OPTIONS');
  });

  it('exports AP_TOOL_METADATA_KEY', () => {
    expect(api.AP_TOOL_METADATA_KEY).toBe('apcore:tool');
  });

  it('exports AP_MODULE_METADATA_KEY', () => {
    expect(api.AP_MODULE_METADATA_KEY).toBe('apcore:module');
  });

  it('exports AP_CONTEXT_METADATA_KEY', () => {
    expect(api.AP_CONTEXT_METADATA_KEY).toBe('apcore:context');
  });

  // ---- Bulk check: all expected symbols are present ----

  it('contains all expected runtime exports', () => {
    const expectedRuntime = [
      // Core
      'ApcoreModule',
      'ApcoreRegistryService',
      'ApcoreExecutorService',
      // MCP
      'ApcoreMcpModule',
      'ApcoreMcpService',
      // Decorators
      'ApTool',
      'ApModule',
      'ApContext',
      'ApToolScannerService',
      // Schema
      'SchemaExtractor',
      'SchemaExtractionError',
      'TypeBoxAdapter',
      'ZodAdapter',
      'DtoAdapter',
      'JsonSchemaAdapter',
      // Bridge
      'ApBindingLoader',
      // Utilities
      'normalizeClassName',
      'normalizeMethodName',
      'generateModuleId',
      // Constants
      'APCORE_MODULE_OPTIONS',
      'APCORE_MCP_MODULE_OPTIONS',
      'AP_TOOL_METADATA_KEY',
      'AP_MODULE_METADATA_KEY',
      'AP_CONTEXT_METADATA_KEY',
    ];

    const missing = expectedRuntime.filter((name) => !(name in api));
    expect(missing).toEqual([]);
  });
});
