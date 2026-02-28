import { ApBindingLoader } from '../../src/bridge/binding-loader.js';
import type { ApcoreRegistryService } from '../../src/core/apcore-registry.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capture registered modules keyed by moduleId. */
function createMockRegistry() {
  const registered = new Map<string, unknown>();

  const registry = {
    register: vi.fn((id: string, mod: unknown) => {
      registered.set(id, mod);
    }),
    unregister: vi.fn(),
    get: vi.fn((id: string) => registered.get(id) ?? null),
    has: vi.fn((id: string) => registered.has(id)),
    list: vi.fn(() => [...registered.keys()]),
    getDefinition: vi.fn(),
    on: vi.fn(),
    discover: vi.fn(),
    get count() {
      return registered.size;
    },
    raw: {} as unknown,
    registerMethod: vi.fn(),
    registerService: vi.fn(),
  } as unknown as ApcoreRegistryService;

  return { registry, registered };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApBindingLoader', () => {
  // -----------------------------------------------------------------------
  // loadFromString - basic parsing and registration
  // -----------------------------------------------------------------------

  describe('loadFromString()', () => {
    it('parses YAML and registers a single module', () => {
      const { registry } = createMockRegistry();
      const loader = new ApBindingLoader(registry);

      const yaml = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send an email"
`;

      const ids = loader.loadFromString(yaml);

      expect(ids).toEqual(['email.send']);
      expect(registry.register).toHaveBeenCalledTimes(1);
      expect(registry.register).toHaveBeenCalledWith(
        'email.send',
        expect.objectContaining({
          description: 'Send an email',
        }),
      );
    });

    it('registers multiple bindings', () => {
      const { registry } = createMockRegistry();
      const loader = new ApBindingLoader(registry);

      const yaml = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send an email"
  - module_id: "email.list"
    target: "EmailService.list"
    description: "List emails"
  - module_id: "user.create"
    target: "UserService.create"
    description: "Create a user"
`;

      const ids = loader.loadFromString(yaml);

      expect(ids).toHaveLength(3);
      expect(ids).toEqual(['email.send', 'email.list', 'user.create']);
      expect(registry.register).toHaveBeenCalledTimes(3);
    });

    it('preserves annotations from binding', () => {
      const { registry } = createMockRegistry();
      const loader = new ApBindingLoader(registry);

      const yaml = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send an email"
    annotations:
      destructive: true
      readonly: false
`;

      loader.loadFromString(yaml);

      expect(registry.register).toHaveBeenCalledWith(
        'email.send',
        expect.objectContaining({
          annotations: { destructive: true, readonly: false },
        }),
      );
    });

    it('preserves tags from binding', () => {
      const { registry } = createMockRegistry();
      const loader = new ApBindingLoader(registry);

      const yaml = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send an email"
    tags: ["email", "io"]
`;

      loader.loadFromString(yaml);

      expect(registry.register).toHaveBeenCalledWith(
        'email.send',
        expect.objectContaining({
          tags: ['email', 'io'],
        }),
      );
    });

    it('preserves documentation from binding', () => {
      const { registry } = createMockRegistry();
      const loader = new ApBindingLoader(registry);

      const yaml = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send an email"
    documentation: "Full documentation for the send email module."
`;

      loader.loadFromString(yaml);

      expect(registry.register).toHaveBeenCalledWith(
        'email.send',
        expect.objectContaining({
          documentation: 'Full documentation for the send email module.',
        }),
      );
    });

    it('uses default schemas (empty object) when not provided', () => {
      const { registry } = createMockRegistry();
      const loader = new ApBindingLoader(registry);

      const yaml = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send an email"
`;

      loader.loadFromString(yaml);

      const call = (registry.register as ReturnType<typeof vi.fn>).mock.calls[0];
      const registeredModule = call[1];
      // Should have inputSchema and outputSchema as empty-like objects
      expect(registeredModule.inputSchema).toBeDefined();
      expect(registeredModule.outputSchema).toBeDefined();
    });

    it('passes custom input_schema and output_schema when provided', () => {
      const { registry } = createMockRegistry();
      const loader = new ApBindingLoader(registry);

      const yaml = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send an email"
    input_schema:
      type: object
      properties:
        to:
          type: string
        subject:
          type: string
    output_schema:
      type: object
      properties:
        sent:
          type: boolean
`;

      loader.loadFromString(yaml);

      const call = (registry.register as ReturnType<typeof vi.fn>).mock.calls[0];
      const registeredModule = call[1];
      expect(registeredModule.inputSchema).toEqual({
        type: 'object',
        properties: {
          to: { type: 'string' },
          subject: { type: 'string' },
        },
      });
      expect(registeredModule.outputSchema).toEqual({
        type: 'object',
        properties: {
          sent: { type: 'boolean' },
        },
      });
    });

    it('returns empty array for YAML with no bindings', () => {
      const { registry } = createMockRegistry();
      const loader = new ApBindingLoader(registry);

      const yaml = `
bindings: []
`;
      const ids = loader.loadFromString(yaml);
      expect(ids).toEqual([]);
      expect(registry.register).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // instanceProvider integration
  // -----------------------------------------------------------------------

  describe('instanceProvider', () => {
    it('calls instanceProvider with className from target', () => {
      const { registry } = createMockRegistry();
      const instanceProvider = vi.fn().mockReturnValue(undefined);
      const loader = new ApBindingLoader(registry, instanceProvider);

      const yaml = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send an email"
`;

      loader.loadFromString(yaml);

      expect(instanceProvider).toHaveBeenCalledWith('EmailService');
    });

    it('creates working execute function when instance is found', async () => {
      const { registry, registered } = createMockRegistry();

      const mockInstance = {
        send: vi.fn().mockReturnValue({ sent: true, to: 'test@example.com' }),
      };
      const instanceProvider = vi.fn().mockReturnValue(mockInstance);
      const loader = new ApBindingLoader(registry, instanceProvider);

      const yaml = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send an email"
`;

      loader.loadFromString(yaml);

      const mod = registered.get('email.send') as { execute: (inputs: Record<string, unknown>) => Promise<Record<string, unknown>> };
      expect(mod).toBeDefined();

      const result = await mod.execute({ to: 'test@example.com' });
      expect(mockInstance.send).toHaveBeenCalledWith({ to: 'test@example.com' });
      expect(result).toEqual({ sent: true, to: 'test@example.com' });
    });

    it('normalizes null return value to empty object', async () => {
      const { registry, registered } = createMockRegistry();

      const mockInstance = { send: vi.fn().mockReturnValue(null) };
      const instanceProvider = vi.fn().mockReturnValue(mockInstance);
      const loader = new ApBindingLoader(registry, instanceProvider);

      const yaml = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send an email"
`;

      loader.loadFromString(yaml);

      const mod = registered.get('email.send') as { execute: (inputs: Record<string, unknown>) => Promise<Record<string, unknown>> };
      const result = await mod.execute({});
      expect(result).toEqual({});
    });

    it('normalizes undefined return value to empty object', async () => {
      const { registry, registered } = createMockRegistry();

      const mockInstance = { send: vi.fn().mockReturnValue(undefined) };
      const instanceProvider = vi.fn().mockReturnValue(mockInstance);
      const loader = new ApBindingLoader(registry, instanceProvider);

      const yaml = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send"
`;

      loader.loadFromString(yaml);

      const mod = registered.get('email.send') as { execute: (inputs: Record<string, unknown>) => Promise<Record<string, unknown>> };
      const result = await mod.execute({});
      expect(result).toEqual({});
    });

    it('normalizes non-object return to { result: value }', async () => {
      const { registry, registered } = createMockRegistry();

      const mockInstance = { send: vi.fn().mockReturnValue('OK') };
      const instanceProvider = vi.fn().mockReturnValue(mockInstance);
      const loader = new ApBindingLoader(registry, instanceProvider);

      const yaml = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send"
`;

      loader.loadFromString(yaml);

      const mod = registered.get('email.send') as { execute: (inputs: Record<string, unknown>) => Promise<Record<string, unknown>> };
      const result = await mod.execute({});
      expect(result).toEqual({ result: 'OK' });
    });

    it('normalizes array return to { result: value }', async () => {
      const { registry, registered } = createMockRegistry();

      const mockInstance = { list: vi.fn().mockReturnValue([1, 2, 3]) };
      const instanceProvider = vi.fn().mockReturnValue(mockInstance);
      const loader = new ApBindingLoader(registry, instanceProvider);

      const yaml = `
bindings:
  - module_id: "items.list"
    target: "ItemService.list"
    description: "List items"
`;

      loader.loadFromString(yaml);

      const mod = registered.get('items.list') as { execute: (inputs: Record<string, unknown>) => Promise<Record<string, unknown>> };
      const result = await mod.execute({});
      expect(result).toEqual({ result: [1, 2, 3] });
    });

    it('handles async instance methods', async () => {
      const { registry, registered } = createMockRegistry();

      const mockInstance = {
        send: vi.fn().mockResolvedValue({ sent: true }),
      };
      const instanceProvider = vi.fn().mockReturnValue(mockInstance);
      const loader = new ApBindingLoader(registry, instanceProvider);

      const yaml = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send"
`;

      loader.loadFromString(yaml);

      const mod = registered.get('email.send') as { execute: (inputs: Record<string, unknown>) => Promise<Record<string, unknown>> };
      const result = await mod.execute({ to: 'a@b.com' });
      expect(result).toEqual({ sent: true });
    });
  });

  // -----------------------------------------------------------------------
  // execute error when no instance/provider
  // -----------------------------------------------------------------------

  describe('execute without instance', () => {
    it('returns error when no instanceProvider is set', async () => {
      const { registry, registered } = createMockRegistry();
      const loader = new ApBindingLoader(registry);

      const yaml = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send"
`;

      loader.loadFromString(yaml);

      const mod = registered.get('email.send') as { execute: (inputs: Record<string, unknown>) => Promise<Record<string, unknown>> };
      const result = await mod.execute({});
      expect(result).toHaveProperty('error');
      expect((result as Record<string, string>).error).toContain('EmailService');
    });

    it('returns error when instanceProvider returns undefined', async () => {
      const { registry, registered } = createMockRegistry();
      const instanceProvider = vi.fn().mockReturnValue(undefined);
      const loader = new ApBindingLoader(registry, instanceProvider);

      const yaml = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send"
`;

      loader.loadFromString(yaml);

      const mod = registered.get('email.send') as { execute: (inputs: Record<string, unknown>) => Promise<Record<string, unknown>> };
      const result = await mod.execute({});
      expect(result).toHaveProperty('error');
    });
  });

  // -----------------------------------------------------------------------
  // loadFromFile
  // -----------------------------------------------------------------------

  describe('loadFromFile()', () => {
    it('reads a file and returns module IDs', async () => {
      const { registry } = createMockRegistry();
      const loader = new ApBindingLoader(registry);

      // We'll use a temporary file approach via the test
      const fs = await import('node:fs/promises');
      const os = await import('node:os');
      const path = await import('node:path');

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apcore-test-'));
      const tmpFile = path.join(tmpDir, 'bindings.yaml');

      const yamlContent = `
bindings:
  - module_id: "email.send"
    target: "EmailService.send"
    description: "Send an email"
  - module_id: "user.create"
    target: "UserService.create"
    description: "Create user"
`;

      await fs.writeFile(tmpFile, yamlContent, 'utf-8');

      try {
        const ids = await loader.loadFromFile(tmpFile);
        expect(ids).toEqual(['email.send', 'user.create']);
        expect(registry.register).toHaveBeenCalledTimes(2);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
