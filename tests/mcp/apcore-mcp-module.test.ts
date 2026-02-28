import { Test } from '@nestjs/testing';
import { Global, Module, Injectable, Inject } from '@nestjs/common';
import type { Executor, Registry } from 'apcore-js';
import { ApcoreMcpModule } from '../../src/mcp/apcore-mcp.module.js';
import { ApcoreMcpService } from '../../src/mcp/apcore-mcp.service.js';
import { ApcoreRegistryService } from '../../src/core/apcore-registry.service.js';
import { ApcoreExecutorService } from '../../src/core/apcore-executor.service.js';
import { APCORE_MCP_MODULE_OPTIONS } from '../../src/constants.js';
import type { ApcoreMcpModuleOptions } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Mock apcore-mcp so no real MCP server is started
// ---------------------------------------------------------------------------
vi.mock('apcore-mcp', () => ({
  serve: vi.fn().mockResolvedValue(undefined),
  toOpenaiTools: vi.fn().mockReturnValue([]),
}));

// ---------------------------------------------------------------------------
// Helpers: create mock core services to provide in the test module
// ---------------------------------------------------------------------------
function createMockRegistryService(): ApcoreRegistryService {
  const mockRegistry = {
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn(),
    has: vi.fn().mockReturnValue(false),
    list: vi.fn().mockReturnValue([]),
    getDefinition: vi.fn(),
    on: vi.fn(),
    discover: vi.fn().mockResolvedValue(0),
    count: 0,
  } as unknown as Registry;

  return new ApcoreRegistryService(mockRegistry);
}

function createMockExecutorService(): ApcoreExecutorService {
  const mockExecutor = {
    call: vi.fn().mockResolvedValue({}),
    stream: vi.fn(),
    validate: vi.fn().mockReturnValue({ valid: true, errors: [] }),
  } as unknown as Executor;

  return new ApcoreExecutorService(mockExecutor);
}

/**
 * Helper that creates a @Global() mock core module providing
 * ApcoreRegistryService and ApcoreExecutorService, mirroring how
 * the real ApcoreModule works in production (@Global).
 */
function createCoreProvidersModule() {
  const registryService = createMockRegistryService();
  const executorService = createMockExecutorService();

  @Global()
  @Module({
    providers: [
      { provide: ApcoreRegistryService, useValue: registryService },
      { provide: ApcoreExecutorService, useValue: executorService },
    ],
    exports: [ApcoreRegistryService, ApcoreExecutorService],
  })
  class MockCoreModule {}

  return { MockCoreModule, registryService, executorService };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ApcoreMcpModule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // forRoot
  // -----------------------------------------------------------------------
  describe('forRoot()', () => {
    it('creates a module with ApcoreMcpService available', async () => {
      const { MockCoreModule } = createCoreProvidersModule();

      const module = await Test.createTestingModule({
        imports: [
          MockCoreModule,
          ApcoreMcpModule.forRoot({ transport: 'stdio' }),
        ],
      }).compile();

      const mcpService = module.get(ApcoreMcpService);
      expect(mcpService).toBeDefined();
      expect(mcpService).toBeInstanceOf(ApcoreMcpService);
    });

    it('provides the APCORE_MCP_MODULE_OPTIONS token', async () => {
      const { MockCoreModule } = createCoreProvidersModule();
      const opts: ApcoreMcpModuleOptions = {
        transport: 'streamable-http',
        port: 8080,
        name: 'test-mcp',
      };

      const module = await Test.createTestingModule({
        imports: [MockCoreModule, ApcoreMcpModule.forRoot(opts)],
      }).compile();

      const injectedOpts = module.get(APCORE_MCP_MODULE_OPTIONS);
      expect(injectedOpts).toEqual(opts);
    });

    it('exports ApcoreMcpService and options token in the DynamicModule', () => {
      const dynamicModule = ApcoreMcpModule.forRoot({});

      expect(dynamicModule.exports).toContain(ApcoreMcpService);
      expect(dynamicModule.exports).toContain(APCORE_MCP_MODULE_OPTIONS);
    });

    it('exports are consumable by importing modules', async () => {
      const { MockCoreModule } = createCoreProvidersModule();
      const mcpDynamic = ApcoreMcpModule.forRoot({ name: 'export-test' });

      @Injectable()
      class ConsumerService {
        constructor(
          @Inject(ApcoreMcpService)
          public readonly mcp: ApcoreMcpService,
          @Inject(APCORE_MCP_MODULE_OPTIONS)
          public readonly options: ApcoreMcpModuleOptions,
        ) {}
      }

      @Module({
        imports: [mcpDynamic],
        providers: [ConsumerService],
        exports: [ConsumerService],
      })
      class ConsumerModule {}

      const module = await Test.createTestingModule({
        imports: [MockCoreModule, ConsumerModule],
      }).compile();

      const consumer = module.get(ConsumerService);
      expect(consumer.mcp).toBeInstanceOf(ApcoreMcpService);
      expect(consumer.options).toEqual({ name: 'export-test' });
    });

    it('injects registry and executor services into ApcoreMcpService', async () => {
      const { MockCoreModule } = createCoreProvidersModule();

      const module = await Test.createTestingModule({
        imports: [MockCoreModule, ApcoreMcpModule.forRoot({})],
      }).compile();

      const mcpService = module.get(ApcoreMcpService);
      // The service should have been constructed with the mock services
      expect(mcpService).toBeDefined();
      // Verify the service works (calls through to the injected dependencies)
      expect(mcpService.toolCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // forRootAsync
  // -----------------------------------------------------------------------
  describe('forRootAsync()', () => {
    it('creates a module with async factory', async () => {
      const { MockCoreModule } = createCoreProvidersModule();

      const module = await Test.createTestingModule({
        imports: [
          MockCoreModule,
          ApcoreMcpModule.forRootAsync({
            useFactory: async () => ({ transport: 'stdio' as const }),
          }),
        ],
      }).compile();

      const mcpService = module.get(ApcoreMcpService);
      expect(mcpService).toBeDefined();
      expect(mcpService).toBeInstanceOf(ApcoreMcpService);
    });

    it('provides the APCORE_MCP_MODULE_OPTIONS token from async factory', async () => {
      const { MockCoreModule } = createCoreProvidersModule();
      const opts: ApcoreMcpModuleOptions = {
        transport: 'sse',
        port: 3000,
        name: 'async-mcp',
      };

      const module = await Test.createTestingModule({
        imports: [
          MockCoreModule,
          ApcoreMcpModule.forRootAsync({
            useFactory: async () => opts,
          }),
        ],
      }).compile();

      const injectedOpts = module.get(APCORE_MCP_MODULE_OPTIONS);
      expect(injectedOpts).toEqual(opts);
    });

    it('supports inject array for factory dependencies', async () => {
      const CONFIG_TOKEN = 'MCP_CONFIG_TOKEN';

      @Module({
        providers: [
          {
            provide: CONFIG_TOKEN,
            useValue: { serverName: 'injected-mcp', serverPort: 9090 },
          },
        ],
        exports: [CONFIG_TOKEN],
      })
      class McpConfigModule {}

      const { MockCoreModule } = createCoreProvidersModule();

      const module = await Test.createTestingModule({
        imports: [
          MockCoreModule,
          ApcoreMcpModule.forRootAsync({
            imports: [McpConfigModule],
            useFactory: (async (config: {
              serverName: string;
              serverPort: number;
            }) => ({
              name: config.serverName,
              port: config.serverPort,
            })) as any,
            inject: [CONFIG_TOKEN],
          }),
        ],
      }).compile();

      const opts = module.get(APCORE_MCP_MODULE_OPTIONS);
      expect(opts).toEqual({ name: 'injected-mcp', port: 9090 });
    });

    it('exports ApcoreMcpService and options token in the DynamicModule', () => {
      const dynamicModule = ApcoreMcpModule.forRootAsync({
        useFactory: async () => ({}),
      });

      expect(dynamicModule.exports).toContain(ApcoreMcpService);
      expect(dynamicModule.exports).toContain(APCORE_MCP_MODULE_OPTIONS);
    });

    it('ApcoreMcpService is injectable via importing module', async () => {
      const { MockCoreModule } = createCoreProvidersModule();

      const asyncMcpDynamic = ApcoreMcpModule.forRootAsync({
        useFactory: async () => ({ name: 'async-consumer-test' }),
      });

      @Injectable()
      class AsyncConsumerService {
        constructor(
          @Inject(ApcoreMcpService)
          public readonly mcp: ApcoreMcpService,
        ) {}
      }

      @Module({
        imports: [asyncMcpDynamic],
        providers: [AsyncConsumerService],
        exports: [AsyncConsumerService],
      })
      class AsyncConsumerModule {}

      const module = await Test.createTestingModule({
        imports: [MockCoreModule, AsyncConsumerModule],
      }).compile();

      const consumer = module.get(AsyncConsumerService);
      expect(consumer.mcp).toBeInstanceOf(ApcoreMcpService);
    });

    it('works with synchronous factory function', async () => {
      const { MockCoreModule } = createCoreProvidersModule();

      const module = await Test.createTestingModule({
        imports: [
          MockCoreModule,
          ApcoreMcpModule.forRootAsync({
            useFactory: () => ({ name: 'sync-factory' }),
          }),
        ],
      }).compile();

      const opts = module.get(APCORE_MCP_MODULE_OPTIONS);
      expect(opts).toEqual({ name: 'sync-factory' });

      const mcpService = module.get(ApcoreMcpService);
      expect(mcpService).toBeInstanceOf(ApcoreMcpService);
    });
  });
});
