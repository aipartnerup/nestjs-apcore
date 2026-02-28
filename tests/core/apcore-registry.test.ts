import { ApcoreRegistryService } from '../../src/core/apcore-registry.service.js';
import type { Registry } from 'apcore-js';
// ---------------------------------------------------------------------------
// Mock Registry factory
// ---------------------------------------------------------------------------

function createMockRegistry(): Registry {
  return {
    register: vi.fn(),
    unregister: vi.fn().mockReturnValue(true),
    get: vi.fn().mockReturnValue({ execute: vi.fn() }),
    has: vi.fn().mockReturnValue(true),
    list: vi.fn().mockReturnValue(['mod.a', 'mod.b']),
    getDefinition: vi.fn().mockReturnValue({ id: 'mod.a' }),
    on: vi.fn(),
    discover: vi.fn().mockResolvedValue(3),
    get count() {
      return 5;
    },
  } as unknown as Registry;
}

// ---------------------------------------------------------------------------
// Tests: delegation to upstream Registry
// ---------------------------------------------------------------------------

describe('ApcoreRegistryService', () => {
  let mockRegistry: Registry;
  let service: ApcoreRegistryService;

  beforeEach(() => {
    mockRegistry = createMockRegistry();
    service = new ApcoreRegistryService(mockRegistry);
  });

  // ---- raw getter ----

  describe('raw', () => {
    it('returns the underlying Registry instance', () => {
      expect(service.raw).toBe(mockRegistry);
    });
  });

  // ---- delegated methods ----

  describe('register()', () => {
    it('delegates to upstream registry.register()', () => {
      const mod = { execute: vi.fn() };
      service.register('my.mod', mod);
      expect(mockRegistry.register).toHaveBeenCalledWith('my.mod', mod);
    });
  });

  describe('unregister()', () => {
    it('delegates and returns result', () => {
      const result = service.unregister('my.mod');
      expect(mockRegistry.unregister).toHaveBeenCalledWith('my.mod');
      expect(result).toBe(true);
    });
  });

  describe('get()', () => {
    it('delegates and returns module', () => {
      const result = service.get('my.mod');
      expect(mockRegistry.get).toHaveBeenCalledWith('my.mod');
      expect(result).toEqual({ execute: expect.any(Function) });
    });
  });

  describe('has()', () => {
    it('delegates and returns boolean', () => {
      const result = service.has('my.mod');
      expect(mockRegistry.has).toHaveBeenCalledWith('my.mod');
      expect(result).toBe(true);
    });
  });

  describe('list()', () => {
    it('delegates without options', () => {
      const result = service.list();
      expect(mockRegistry.list).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(['mod.a', 'mod.b']);
    });

    it('delegates with options', () => {
      service.list({ tags: ['io'], prefix: 'mod' });
      expect(mockRegistry.list).toHaveBeenCalledWith({ tags: ['io'], prefix: 'mod' });
    });
  });

  describe('getDefinition()', () => {
    it('delegates and returns descriptor', () => {
      const result = service.getDefinition('mod.a');
      expect(mockRegistry.getDefinition).toHaveBeenCalledWith('mod.a');
      expect(result).toEqual({ id: 'mod.a' });
    });
  });

  describe('on()', () => {
    it('delegates event registration', () => {
      const cb = vi.fn();
      service.on('register', cb);
      expect(mockRegistry.on).toHaveBeenCalledWith('register', cb);
    });
  });

  describe('discover()', () => {
    it('delegates and returns count', async () => {
      const result = await service.discover();
      expect(mockRegistry.discover).toHaveBeenCalled();
      expect(result).toBe(3);
    });
  });

  describe('count', () => {
    it('delegates count getter', () => {
      expect(service.count).toBe(5);
    });
  });

  // -----------------------------------------------------------------------
  // registerMethod()
  // -----------------------------------------------------------------------

  describe('registerMethod()', () => {
    class EmailService {
      sendEmail(inputs: Record<string, unknown>) {
        return { sent: true, to: inputs['to'] };
      }
    }

    it('registers a FunctionModule with auto-generated ID', () => {
      const instance = new EmailService();
      const id = service.registerMethod({
        instance,
        method: 'sendEmail',
        description: 'Sends an email',
      });

      // Generated ID: normalizeClassName('EmailService') + '.' + normalizeMethodName('sendEmail')
      // => 'email.send_email'
      expect(id).toBe('email.send_email');
      expect(mockRegistry.register).toHaveBeenCalledWith(
        'email.send_email',
        expect.objectContaining({
          description: 'Sends an email',
        }),
      );
    });

    it('uses explicit id when provided', () => {
      const instance = new EmailService();
      const id = service.registerMethod({
        instance,
        method: 'sendEmail',
        description: 'Sends an email',
        id: 'custom.send',
      });

      expect(id).toBe('custom.send');
      expect(mockRegistry.register).toHaveBeenCalledWith(
        'custom.send',
        expect.anything(),
      );
    });

    it('passes optional fields (tags, annotations, documentation, examples) to FunctionModule', () => {
      const instance = new EmailService();
      service.registerMethod({
        instance,
        method: 'sendEmail',
        description: 'Sends an email',
        tags: ['io', 'email'],
        annotations: { readonly: false, destructive: false, idempotent: true },
        documentation: 'Full docs here',
        examples: [{ title: 'Send', inputs: { to: 'a@b.com' }, output: { sent: true } }],
      });

      expect(mockRegistry.register).toHaveBeenCalledWith(
        'email.send_email',
        expect.objectContaining({
          tags: ['io', 'email'],
          documentation: 'Full docs here',
          examples: [{ title: 'Send', inputs: { to: 'a@b.com' }, output: { sent: true } }],
        }),
      );
    });

    it('execute function calls the method on the instance and returns result', async () => {
      // Replace register with a spy that captures the module
      let registeredModule: { execute: (inputs: Record<string, unknown>, ctx: unknown) => Promise<Record<string, unknown>> } | undefined;
      (mockRegistry.register as ReturnType<typeof vi.fn>).mockImplementation(
        (_id: string, mod: unknown) => {
          registeredModule = mod as typeof registeredModule;
        },
      );

      const instance = new EmailService();
      service.registerMethod({
        instance,
        method: 'sendEmail',
        description: 'Sends an email',
      });

      expect(registeredModule).toBeDefined();
      const result = await registeredModule!.execute({ to: 'test@example.com' }, {} as never);
      expect(result).toEqual({ sent: true, to: 'test@example.com' });
    });

    it('normalizes null return to empty object', async () => {
      class NullService {
        doNothing() {
          return null;
        }
      }

      let registeredModule: { execute: (inputs: Record<string, unknown>, ctx: unknown) => Promise<Record<string, unknown>> } | undefined;
      (mockRegistry.register as ReturnType<typeof vi.fn>).mockImplementation(
        (_id: string, mod: unknown) => {
          registeredModule = mod as typeof registeredModule;
        },
      );

      const instance = new NullService();
      service.registerMethod({
        instance,
        method: 'doNothing',
        description: 'Returns null',
      });

      const result = await registeredModule!.execute({}, {} as never);
      expect(result).toEqual({});
    });

    it('normalizes undefined return to empty object', async () => {
      class VoidService {
        doVoid() {
          return undefined;
        }
      }

      let registeredModule: { execute: (inputs: Record<string, unknown>, ctx: unknown) => Promise<Record<string, unknown>> } | undefined;
      (mockRegistry.register as ReturnType<typeof vi.fn>).mockImplementation(
        (_id: string, mod: unknown) => {
          registeredModule = mod as typeof registeredModule;
        },
      );

      const instance = new VoidService();
      service.registerMethod({
        instance,
        method: 'doVoid',
        description: 'Returns undefined',
      });

      const result = await registeredModule!.execute({}, {} as never);
      expect(result).toEqual({});
    });

    it('normalizes non-object return to { result: value }', async () => {
      class StringService {
        greet() {
          return 'hello';
        }
      }

      let registeredModule: { execute: (inputs: Record<string, unknown>, ctx: unknown) => Promise<Record<string, unknown>> } | undefined;
      (mockRegistry.register as ReturnType<typeof vi.fn>).mockImplementation(
        (_id: string, mod: unknown) => {
          registeredModule = mod as typeof registeredModule;
        },
      );

      const instance = new StringService();
      service.registerMethod({
        instance,
        method: 'greet',
        description: 'Returns a string',
      });

      const result = await registeredModule!.execute({}, {} as never);
      expect(result).toEqual({ result: 'hello' });
    });

    it('normalizes numeric return to { result: value }', async () => {
      class NumService {
        compute() {
          return 42;
        }
      }

      let registeredModule: { execute: (inputs: Record<string, unknown>, ctx: unknown) => Promise<Record<string, unknown>> } | undefined;
      (mockRegistry.register as ReturnType<typeof vi.fn>).mockImplementation(
        (_id: string, mod: unknown) => {
          registeredModule = mod as typeof registeredModule;
        },
      );

      const instance = new NumService();
      service.registerMethod({
        instance,
        method: 'compute',
        description: 'Returns a number',
      });

      const result = await registeredModule!.execute({}, {} as never);
      expect(result).toEqual({ result: 42 });
    });

    it('passes through object returns as-is', async () => {
      class ObjService {
        getData() {
          return { foo: 'bar', count: 1 };
        }
      }

      let registeredModule: { execute: (inputs: Record<string, unknown>, ctx: unknown) => Promise<Record<string, unknown>> } | undefined;
      (mockRegistry.register as ReturnType<typeof vi.fn>).mockImplementation(
        (_id: string, mod: unknown) => {
          registeredModule = mod as typeof registeredModule;
        },
      );

      const instance = new ObjService();
      service.registerMethod({
        instance,
        method: 'getData',
        description: 'Returns an object',
      });

      const result = await registeredModule!.execute({}, {} as never);
      expect(result).toEqual({ foo: 'bar', count: 1 });
    });

    it('handles async methods', async () => {
      class AsyncService {
        async fetchData() {
          return { data: 'async-result' };
        }
      }

      let registeredModule: { execute: (inputs: Record<string, unknown>, ctx: unknown) => Promise<Record<string, unknown>> } | undefined;
      (mockRegistry.register as ReturnType<typeof vi.fn>).mockImplementation(
        (_id: string, mod: unknown) => {
          registeredModule = mod as typeof registeredModule;
        },
      );

      const instance = new AsyncService();
      service.registerMethod({
        instance,
        method: 'fetchData',
        description: 'Async method',
      });

      const result = await registeredModule!.execute({}, {} as never);
      expect(result).toEqual({ data: 'async-result' });
    });

    it('throws when method does not exist on instance', () => {
      class EmptyService {}
      const instance = new EmptyService();

      expect(() =>
        service.registerMethod({
          instance,
          method: 'nonExistent',
          description: 'Does not exist',
        }),
      ).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // registerService()
  // -----------------------------------------------------------------------

  describe('registerService()', () => {
    class OrderService {
      createOrder(_inputs: Record<string, unknown>) {
        return { orderId: '123' };
      }

      cancelOrder(_inputs: Record<string, unknown>) {
        return { cancelled: true };
      }

      getStatus(_inputs: Record<string, unknown>) {
        return { status: 'active' };
      }
    }

    it('registers specific methods by name', () => {
      const instance = new OrderService();
      const ids = service.registerService({
        instance,
        methods: ['createOrder', 'cancelOrder'],
        description: 'Order operations',
      });

      expect(ids).toHaveLength(2);
      expect(ids).toContain('order.create_order');
      expect(ids).toContain('order.cancel_order');
      expect(mockRegistry.register).toHaveBeenCalledTimes(2);
    });

    it('registers all public methods with wildcard "*"', () => {
      const instance = new OrderService();
      const ids = service.registerService({
        instance,
        methods: '*',
        description: 'All order operations',
      });

      expect(ids).toHaveLength(3);
      expect(ids).toContain('order.create_order');
      expect(ids).toContain('order.cancel_order');
      expect(ids).toContain('order.get_status');
      expect(mockRegistry.register).toHaveBeenCalledTimes(3);
    });

    it('excludes constructor when using wildcard', () => {
      const instance = new OrderService();
      const ids = service.registerService({
        instance,
        methods: '*',
      });

      const hasConstructor = ids.some((id) => id.includes('constructor'));
      expect(hasConstructor).toBe(false);
    });

    it('respects exclude array', () => {
      const instance = new OrderService();
      const ids = service.registerService({
        instance,
        methods: '*',
        exclude: ['getStatus'],
      });

      expect(ids).toHaveLength(2);
      expect(ids).not.toContain('order.get_status');
    });

    it('uses namespace when provided', () => {
      const instance = new OrderService();
      const ids = service.registerService({
        instance,
        methods: ['createOrder'],
        namespace: 'orders',
      });

      expect(ids).toEqual(['orders.create_order']);
    });

    it('applies per-method options from methodOptions', () => {
      const instance = new OrderService();
      const ids = service.registerService({
        instance,
        methods: ['createOrder'],
        methodOptions: {
          createOrder: {
            description: 'Custom description for createOrder',
            id: 'custom.create',
          },
        },
      });

      expect(ids).toContain('custom.create');
      expect(mockRegistry.register).toHaveBeenCalledWith(
        'custom.create',
        expect.objectContaining({
          description: 'Custom description for createOrder',
        }),
      );
    });

    it('uses service-level description as default for methods', () => {
      const instance = new OrderService();
      service.registerService({
        instance,
        methods: ['createOrder'],
        description: 'Service-level description',
      });

      expect(mockRegistry.register).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          description: 'Service-level description',
        }),
      );
    });

    it('method-level description overrides service-level description', () => {
      const instance = new OrderService();
      service.registerService({
        instance,
        methods: ['createOrder'],
        description: 'Service-level description',
        methodOptions: {
          createOrder: {
            description: 'Method-level description',
          },
        },
      });

      expect(mockRegistry.register).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          description: 'Method-level description',
        }),
      );
    });

    it('passes service-level tags and annotations to methods', () => {
      const instance = new OrderService();
      service.registerService({
        instance,
        methods: ['createOrder'],
        tags: ['commerce'],
        annotations: { destructive: true },
      });

      expect(mockRegistry.register).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tags: ['commerce'],
        }),
      );
    });

    it('handles class with no methods gracefully (wildcard)', () => {
      class EmptyService {}
      const instance = new EmptyService();
      const ids = service.registerService({
        instance,
        methods: '*',
      });

      expect(ids).toEqual([]);
      expect(mockRegistry.register).not.toHaveBeenCalled();
    });

    it('discovers inherited methods from prototype chain', () => {
      class BaseService {
        baseMethod() {
          return { base: true };
        }
      }
      class ChildService extends BaseService {
        childMethod() {
          return { child: true };
        }
      }

      const instance = new ChildService();
      const ids = service.registerService({
        instance,
        methods: '*',
      });

      expect(ids).toContain('child.child_method');
      expect(ids).toContain('child.base_method');
    });
  });
});
