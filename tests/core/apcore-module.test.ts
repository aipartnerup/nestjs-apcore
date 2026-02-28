import { Test } from '@nestjs/testing';
import { Module, Injectable, Inject } from '@nestjs/common';
import { ApcoreModule } from '../../src/core/apcore.module.js';
import { ApcoreRegistryService } from '../../src/core/apcore-registry.service.js';
import { ApcoreExecutorService } from '../../src/core/apcore-executor.service.js';
import { APCORE_MODULE_OPTIONS } from '../../src/constants.js';
import type { ApcoreModuleOptions } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Mock apcore-js so no real file-system or runtime logic is needed.
// Because vi.mock is hoisted, the factory must be self-contained.
// We use vi.hoisted() to create references accessible both inside the
// mock factory and in test assertions.
// ---------------------------------------------------------------------------
const { mockRegistry, MockRegistry, MockExecutor } = vi.hoisted(
  () => {
    const _mockRegistry = {
      register: vi.fn(),
      unregister: vi.fn(),
      get: vi.fn(),
      has: vi.fn().mockReturnValue(false),
      list: vi.fn().mockReturnValue([]),
      getDefinition: vi.fn(),
      on: vi.fn(),
      discover: vi.fn().mockResolvedValue(0),
      count: 0,
      moduleIds: [],
    };

    const _mockExecutor = {
      registry: _mockRegistry,
      call: vi.fn().mockResolvedValue({}),
      callAsync: vi.fn().mockResolvedValue({}),
      stream: vi.fn(),
      validate: vi.fn().mockReturnValue({ valid: true, errors: [] }),
    };

    const _MockRegistry = vi.fn(() => _mockRegistry);
    const _MockExecutor = vi.fn(() => _mockExecutor);

    return {
      mockRegistry: _mockRegistry,
      mockExecutor: _mockExecutor,
      MockRegistry: _MockRegistry,
      MockExecutor: _MockExecutor,
    };
  },
);

vi.mock('apcore-js', () => ({
  Registry: MockRegistry,
  Executor: MockExecutor,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApcoreModule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // forRoot
  // -----------------------------------------------------------------------
  describe('forRoot()', () => {
    it('creates a module with ApcoreRegistryService and ApcoreExecutorService available', async () => {
      const module = await Test.createTestingModule({
        imports: [ApcoreModule.forRoot({ extensionsDir: '/tmp/extensions' })],
      }).compile();

      const registry = module.get(ApcoreRegistryService);
      const executor = module.get(ApcoreExecutorService);

      expect(registry).toBeDefined();
      expect(executor).toBeDefined();
    });

    it('provides the APCORE_MODULE_OPTIONS token', async () => {
      const opts: ApcoreModuleOptions = {
        extensionsDir: '/tmp/ext',
        acl: null,
        middleware: [],
      };

      const module = await Test.createTestingModule({
        imports: [ApcoreModule.forRoot(opts)],
      }).compile();

      const injectedOpts = module.get(APCORE_MODULE_OPTIONS);
      expect(injectedOpts).toEqual(opts);
    });

    it('creates upstream Registry with extensionsDir from options', async () => {
      await Test.createTestingModule({
        imports: [ApcoreModule.forRoot({ extensionsDir: '/my/dir' })],
      }).compile();

      expect(MockRegistry).toHaveBeenCalledWith(
        expect.objectContaining({ extensionsDir: '/my/dir' }),
      );
    });

    it('creates upstream Executor with registry and options', async () => {
      const acl = { check: vi.fn() };
      const mw = [{ name: 'logger' }];

      await Test.createTestingModule({
        imports: [
          ApcoreModule.forRoot({
            extensionsDir: '/tmp',
            acl,
            middleware: mw,
          }),
        ],
      }).compile();

      expect(MockExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          registry: mockRegistry,
          acl,
          middlewares: mw,
        }),
      );
    });

    it('returns instances of ApcoreRegistryService and ApcoreExecutorService', async () => {
      const module = await Test.createTestingModule({
        imports: [ApcoreModule.forRoot({})],
      }).compile();

      const registry = module.get(ApcoreRegistryService);
      const executor = module.get(ApcoreExecutorService);

      expect(registry).toBeInstanceOf(ApcoreRegistryService);
      expect(executor).toBeInstanceOf(ApcoreExecutorService);
    });

    it('is global (services available in other modules without importing)', async () => {
      @Injectable()
      class ConsumerService {
        constructor(
          @Inject(ApcoreRegistryService)
          public readonly registry: ApcoreRegistryService,
          @Inject(ApcoreExecutorService)
          public readonly executor: ApcoreExecutorService,
        ) {}
      }

      @Module({
        providers: [ConsumerService],
        exports: [ConsumerService],
      })
      class ConsumerModule {}

      const module = await Test.createTestingModule({
        imports: [ApcoreModule.forRoot({}), ConsumerModule],
      }).compile();

      const consumer = module.get(ConsumerService);
      expect(consumer.registry).toBeInstanceOf(ApcoreRegistryService);
      expect(consumer.executor).toBeInstanceOf(ApcoreExecutorService);
    });
  });

  // -----------------------------------------------------------------------
  // forRootAsync
  // -----------------------------------------------------------------------
  describe('forRootAsync()', () => {
    it('creates a module with async factory', async () => {
      const module = await Test.createTestingModule({
        imports: [
          ApcoreModule.forRootAsync({
            useFactory: async () => ({
              extensionsDir: '/async/dir',
            }),
          }),
        ],
      }).compile();

      const registry = module.get(ApcoreRegistryService);
      const executor = module.get(ApcoreExecutorService);

      expect(registry).toBeDefined();
      expect(executor).toBeDefined();
      expect(registry).toBeInstanceOf(ApcoreRegistryService);
      expect(executor).toBeInstanceOf(ApcoreExecutorService);
    });

    it('provides the APCORE_MODULE_OPTIONS token from async factory', async () => {
      const opts: ApcoreModuleOptions = {
        extensionsDir: '/async/ext',
        acl: null,
      };

      const module = await Test.createTestingModule({
        imports: [
          ApcoreModule.forRootAsync({
            useFactory: async () => opts,
          }),
        ],
      }).compile();

      const injectedOpts = module.get(APCORE_MODULE_OPTIONS);
      expect(injectedOpts).toEqual(opts);
    });

    it('supports inject array for factory dependencies', async () => {
      const CONFIG_TOKEN = 'CONFIG_TOKEN';

      @Module({
        providers: [
          { provide: CONFIG_TOKEN, useValue: { dir: '/injected/path' } },
        ],
        exports: [CONFIG_TOKEN],
      })
      class ConfigModule {}

      const module = await Test.createTestingModule({
        imports: [
          ApcoreModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (async (config: { dir: string }) => ({
              extensionsDir: config.dir,
            })) as any,
            inject: [CONFIG_TOKEN],
          }),
        ],
      }).compile();

      const opts = module.get(APCORE_MODULE_OPTIONS);
      expect(opts).toEqual({ extensionsDir: '/injected/path' });

      expect(MockRegistry).toHaveBeenCalledWith(
        expect.objectContaining({ extensionsDir: '/injected/path' }),
      );
    });

    it('creates upstream Registry and Executor with resolved async options', async () => {
      const acl = { check: vi.fn() };
      const mw = [{ name: 'auth' }];

      await Test.createTestingModule({
        imports: [
          ApcoreModule.forRootAsync({
            useFactory: async () => ({
              extensionsDir: '/async/dir',
              acl,
              middleware: mw,
            }),
          }),
        ],
      }).compile();

      expect(MockRegistry).toHaveBeenCalledWith(
        expect.objectContaining({ extensionsDir: '/async/dir' }),
      );
      expect(MockExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          registry: mockRegistry,
          acl,
          middlewares: mw,
        }),
      );
    });

    it('is global (services available in other modules without importing)', async () => {
      @Injectable()
      class AsyncConsumerService {
        constructor(
          @Inject(ApcoreRegistryService)
          public readonly registry: ApcoreRegistryService,
          @Inject(ApcoreExecutorService)
          public readonly executor: ApcoreExecutorService,
        ) {}
      }

      @Module({
        providers: [AsyncConsumerService],
        exports: [AsyncConsumerService],
      })
      class AsyncConsumerModule {}

      const module = await Test.createTestingModule({
        imports: [
          ApcoreModule.forRootAsync({
            useFactory: async () => ({ extensionsDir: '/global/test' }),
          }),
          AsyncConsumerModule,
        ],
      }).compile();

      const consumer = module.get(AsyncConsumerService);
      expect(consumer.registry).toBeInstanceOf(ApcoreRegistryService);
      expect(consumer.executor).toBeInstanceOf(ApcoreExecutorService);
    });
  });
});
