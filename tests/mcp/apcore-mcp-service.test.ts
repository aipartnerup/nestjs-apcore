import type { Executor, Registry } from 'apcore-js';
import { ApcoreRegistryService } from '../../src/core/apcore-registry.service.js';
import { ApcoreExecutorService } from '../../src/core/apcore-executor.service.js';
import { ApcoreMcpService } from '../../src/mcp/apcore-mcp.service.js';
import type { ApcoreMcpModuleOptions } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Mock apcore-mcp
// ---------------------------------------------------------------------------
vi.mock('apcore-mcp', () => ({
  serve: vi.fn().mockResolvedValue(undefined),
  toOpenaiTools: vi.fn().mockReturnValue([
    { type: 'function', function: { name: 'test_tool' } },
  ]),
}));

// Import after mocking so we get the mocked versions
import { serve, toOpenaiTools } from 'apcore-mcp';

// ---------------------------------------------------------------------------
// Helpers: create mock registry and executor services
// ---------------------------------------------------------------------------
function createMockRegistryService(): ApcoreRegistryService {
  const listSpy = vi.fn().mockReturnValue(['tool.a', 'tool.b', 'tool.c']);
  const mockRegistry = {
    list: listSpy,
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn(),
    has: vi.fn(),
    getDefinition: vi.fn(),
    on: vi.fn(),
    discover: vi.fn(),
    count: 3,
  } as unknown as Registry;

  return new ApcoreRegistryService(mockRegistry);
}

function createMockExecutorService(): ApcoreExecutorService {
  const mockExecutor = {
    call: vi.fn(),
    stream: vi.fn(),
    validate: vi.fn(),
  } as unknown as Executor;

  return new ApcoreExecutorService(mockExecutor);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ApcoreMcpService', () => {
  let registry: ApcoreRegistryService;
  let executor: ApcoreExecutorService;
  let options: ApcoreMcpModuleOptions;
  let service: ApcoreMcpService;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = createMockRegistryService();
    executor = createMockExecutorService();
    options = {};
    service = new ApcoreMcpService(registry, executor, options);
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------
  describe('initial state', () => {
    it('isRunning starts as false', () => {
      expect(service.isRunning).toBe(false);
    });

    it('toolCount returns the number of tools from registry.list()', () => {
      expect(service.toolCount).toBe(3);
    });

    it('toolCount filters by tags when set in options', () => {
      const listSpy = vi.spyOn(registry, 'list');
      const opts: ApcoreMcpModuleOptions = { tags: ['api'] };
      const svc = new ApcoreMcpService(registry, executor, opts);
      // Access toolCount to trigger the list() call
      void svc.toolCount;
      expect(listSpy).toHaveBeenCalledWith({ tags: ['api'], prefix: undefined });
    });

    it('toolCount filters by prefix when set in options', () => {
      const listSpy = vi.spyOn(registry, 'list');
      const opts: ApcoreMcpModuleOptions = { prefix: 'email' };
      const svc = new ApcoreMcpService(registry, executor, opts);
      void svc.toolCount;
      expect(listSpy).toHaveBeenCalledWith({ tags: undefined, prefix: 'email' });
    });
  });

  // -------------------------------------------------------------------------
  // start()
  // -------------------------------------------------------------------------
  describe('start()', () => {
    it('sets isRunning to true', async () => {
      await service.start();
      expect(service.isRunning).toBe(true);
    });

    it('calls serve() from apcore-mcp with executor.raw and options', async () => {
      options.transport = 'stdio';
      options.name = 'test-server';
      service = new ApcoreMcpService(registry, executor, options);

      await service.start();

      expect(serve).toHaveBeenCalledWith(executor.raw, {
        transport: 'stdio',
        name: 'test-server',
      });
    });

    it('passes all relevant options to serve()', async () => {
      const fullOpts: ApcoreMcpModuleOptions = {
        transport: 'streamable-http',
        host: '0.0.0.0',
        port: 8080,
        name: 'my-mcp',
        version: '1.0.0',
        tags: ['api'],
        prefix: 'ns',
        explorer: true,
        explorerPrefix: '/docs',
        allowExecute: true,
        dynamic: true,
        validateInputs: false,
        logLevel: 'DEBUG',
      };
      service = new ApcoreMcpService(registry, executor, fullOpts);

      await service.start();

      expect(serve).toHaveBeenCalledWith(executor.raw, {
        transport: 'streamable-http',
        host: '0.0.0.0',
        port: 8080,
        name: 'my-mcp',
        version: '1.0.0',
        tags: ['api'],
        prefix: 'ns',
        explorer: true,
        explorerPrefix: '/docs',
        allowExecute: true,
        dynamic: true,
        validateInputs: false,
        logLevel: 'DEBUG',
      });
    });

    it('passes metricsCollector to serve()', async () => {
      const mockCollector = { exportPrometheus: vi.fn().mockReturnValue('') };
      const opts: ApcoreMcpModuleOptions = {
        transport: 'streamable-http',
        metricsCollector: mockCollector,
      };
      service = new ApcoreMcpService(registry, executor, opts);

      await service.start();

      expect(serve).toHaveBeenCalledWith(executor.raw, {
        transport: 'streamable-http',
        metricsCollector: mockCollector,
      });
    });

    it('passes onStartup and onShutdown callbacks to serve()', async () => {
      const onStartup = vi.fn();
      const onShutdown = vi.fn();
      const opts: ApcoreMcpModuleOptions = {
        transport: 'stdio',
        onStartup,
        onShutdown,
      };
      service = new ApcoreMcpService(registry, executor, opts);

      await service.start();

      const serveCall = vi.mocked(serve).mock.calls[0];
      expect(serveCall[1]).toMatchObject({
        onStartup,
        onShutdown,
      });
    });

    it('passes authenticator and exemptPaths to serve()', async () => {
      const mockAuthenticator = {
        authenticate: vi.fn().mockResolvedValue(null),
        requireAuth: true,
      };
      const opts: ApcoreMcpModuleOptions = {
        transport: 'streamable-http',
        authenticator: mockAuthenticator,
        exemptPaths: ['/health', '/metrics', '/custom'],
      };
      service = new ApcoreMcpService(registry, executor, opts);

      await service.start();

      expect(serve).toHaveBeenCalledWith(executor.raw, {
        transport: 'streamable-http',
        authenticator: mockAuthenticator,
        exemptPaths: ['/health', '/metrics', '/custom'],
      });
    });
  });

  // -------------------------------------------------------------------------
  // stop()
  // -------------------------------------------------------------------------
  describe('stop()', () => {
    it('sets isRunning to false', async () => {
      await service.start();
      expect(service.isRunning).toBe(true);

      await service.stop();
      expect(service.isRunning).toBe(false);
    });

    it('is safe to call when already stopped', async () => {
      expect(service.isRunning).toBe(false);
      await service.stop();
      expect(service.isRunning).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // restart()
  // -------------------------------------------------------------------------
  describe('restart()', () => {
    it('cycles through stop then start', async () => {
      await service.start();
      expect(service.isRunning).toBe(true);

      vi.mocked(serve).mockClear();

      await service.restart();
      expect(service.isRunning).toBe(true);
      expect(serve).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // toOpenaiTools()
  // -------------------------------------------------------------------------
  describe('toOpenaiTools()', () => {
    it('delegates to apcore-mcp toOpenaiTools()', () => {
      const result = service.toOpenaiTools();

      expect(toOpenaiTools).toHaveBeenCalledWith(executor.raw, undefined);
      expect(result).toEqual([
        { type: 'function', function: { name: 'test_tool' } },
      ]);
    });

    it('passes options through to toOpenaiTools()', () => {
      const toolOptions = {
        embedAnnotations: true,
        strict: true,
        tags: ['api'],
        prefix: 'ns',
      };

      service.toOpenaiTools(toolOptions);

      expect(toOpenaiTools).toHaveBeenCalledWith(executor.raw, toolOptions);
    });
  });

  // -------------------------------------------------------------------------
  // onApplicationBootstrap()
  // -------------------------------------------------------------------------
  describe('onApplicationBootstrap()', () => {
    it('auto-starts when transport is set in options', async () => {
      options.transport = 'stdio';
      service = new ApcoreMcpService(registry, executor, options);

      await service.onApplicationBootstrap();

      expect(service.isRunning).toBe(true);
      expect(serve).toHaveBeenCalled();
    });

    it('does not auto-start when transport is not set', async () => {
      await service.onApplicationBootstrap();

      expect(service.isRunning).toBe(false);
      expect(serve).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // onModuleDestroy()
  // -------------------------------------------------------------------------
  describe('onModuleDestroy()', () => {
    it('auto-stops when running', async () => {
      await service.start();
      expect(service.isRunning).toBe(true);

      await service.onModuleDestroy();

      expect(service.isRunning).toBe(false);
    });

    it('is safe to call when not running', async () => {
      expect(service.isRunning).toBe(false);
      await service.onModuleDestroy();
      expect(service.isRunning).toBe(false);
    });
  });
});
