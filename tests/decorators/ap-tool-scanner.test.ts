import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Type as t } from '@sinclair/typebox';
import { ApTool } from '../../src/decorators/ap-tool.decorator.js';
import { ApModule } from '../../src/decorators/ap-module.decorator.js';
import { ApContext } from '../../src/decorators/ap-context.decorator.js';
import { ApToolScannerService } from '../../src/decorators/ap-tool-scanner.service.js';
import { ApcoreRegistryService } from '../../src/core/apcore-registry.service.js';

// ---------------------------------------------------------------------------
// Mock apcore-js so no real Registry is needed.
// ---------------------------------------------------------------------------
const { mockRegistry, MockRegistry } = vi.hoisted(() => {
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
  const _MockRegistry = vi.fn(() => _mockRegistry);
  return { mockRegistry: _mockRegistry, MockRegistry: _MockRegistry };
});

vi.mock('apcore-js', () => ({
  Registry: MockRegistry,
  Executor: vi.fn(),
  FunctionModule: vi.fn().mockImplementation((opts: Record<string, unknown>) => ({
    moduleId: opts.moduleId,
    description: opts.description,
    inputSchema: opts.inputSchema,
    outputSchema: opts.outputSchema,
    tags: opts.tags,
    annotations: opts.annotations,
    documentation: opts.documentation,
    examples: opts.examples,
    execute: opts.execute,
  })),
}));

function createMockRegistryService() {
  return new ApcoreRegistryService(mockRegistry as any);
}

// ---------------------------------------------------------------------------
// Test provider classes
// ---------------------------------------------------------------------------

@Injectable()
class BasicService {
  @ApTool({ description: 'Say hello' })
  greet(inputs: Record<string, unknown>) {
    return { message: `Hello, ${inputs['name']}!` };
  }

  // Not decorated — should be ignored
  helperMethod() {
    return 'ignored';
  }
}

@ApModule({ namespace: 'email' })
@Injectable()
class EmailService {
  @ApTool({ description: 'Send an email' })
  send(inputs: Record<string, unknown>) {
    return { sent: true, to: inputs['to'] };
  }

  @ApTool({ description: 'Send batch emails' })
  batchSend(inputs: Record<string, unknown>) {
    return { count: (inputs['emails'] as string[]).length };
  }
}

@Injectable()
class ExplicitIdService {
  @ApTool({ id: 'billing.charge_card', description: 'Charge a card' })
  charge(inputs: Record<string, unknown>) {
    return { charged: inputs['amount'] };
  }
}

@Injectable()
class ContextService {
  @ApTool({ description: 'Tool with context' })
  doWork(inputs: Record<string, unknown>, @ApContext() ctx: unknown) {
    return { input: inputs, ctx };
  }
}

@Injectable()
class ContextFirstService {
  @ApTool({ description: 'Context as first param' })
  handle(@ApContext() ctx: unknown, inputs: Record<string, unknown>) {
    return { input: inputs, ctx };
  }
}

@Injectable()
class SchemaService {
  @ApTool({
    description: 'With explicit schemas',
    inputSchema: t.Object({ query: t.String() }),
    outputSchema: t.Object({ results: t.Array(t.String()) }),
  })
  search(inputs: Record<string, unknown>) {
    return { results: [inputs['query']] };
  }
}

@Injectable()
class NullReturnService {
  @ApTool({ description: 'Returns null' })
  doNull() {
    return null;
  }

  @ApTool({ description: 'Returns undefined' })
  doUndefined() {
    return undefined;
  }

  @ApTool({ description: 'Returns a string' })
  doString() {
    return 'hello';
  }

  @ApTool({ description: 'Returns a number' })
  doNumber() {
    return 42;
  }
}

@Injectable()
class NoToolService {
  someMethod() {
    return 'no tool here';
  }
}

@ApModule({ namespace: 'annotated', tags: ['shared-tag'], annotations: { readonly: true } })
@Injectable()
class AnnotatedModuleService {
  @ApTool({
    description: 'Tool with merged annotations',
    tags: ['tool-tag'],
    annotations: { destructive: true },
  })
  action(inputs: Record<string, unknown>) {
    return inputs;
  }
}

// ---------------------------------------------------------------------------
// Helper to build a NestJS test module with the scanner + given providers
// ---------------------------------------------------------------------------

async function buildTestModule(...providers: any[]) {
  const registryService = createMockRegistryService();

  const moduleRef = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [
      ...providers,
      ApToolScannerService,
      { provide: ApcoreRegistryService, useValue: registryService },
    ],
  }).compile();

  // Manually trigger onModuleInit
  const scanner = moduleRef.get(ApToolScannerService);
  scanner.onModuleInit();

  return { moduleRef, scanner, registryService };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApToolScannerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Discovery
  // -----------------------------------------------------------------------

  describe('discovery', () => {
    it('discovers and registers @ApTool decorated methods', async () => {
      await buildTestModule(BasicService);

      expect(mockRegistry.register).toHaveBeenCalledTimes(1);
      const [moduleId] = mockRegistry.register.mock.calls[0];
      expect(moduleId).toBe('basic.greet');
    });

    it('ignores methods without @ApTool decorator', async () => {
      await buildTestModule(BasicService);

      // Only 'greet' is decorated, 'helperMethod' is not
      expect(mockRegistry.register).toHaveBeenCalledTimes(1);
    });

    it('ignores services with no @ApTool methods', async () => {
      await buildTestModule(NoToolService);

      // NoToolService has no @ApTool methods
      expect(mockRegistry.register).not.toHaveBeenCalled();
    });

    it('discovers multiple @ApTool methods on one class', async () => {
      await buildTestModule(EmailService);

      expect(mockRegistry.register).toHaveBeenCalledTimes(2);
      const ids = mockRegistry.register.mock.calls.map(
        (call: unknown[]) => call[0],
      );
      expect(ids).toContain('email.send');
      expect(ids).toContain('email.batch_send');
    });
  });

  // -----------------------------------------------------------------------
  // Namespace resolution
  // -----------------------------------------------------------------------

  describe('namespace resolution', () => {
    it('uses @ApModule namespace when present', async () => {
      await buildTestModule(EmailService);

      const ids = mockRegistry.register.mock.calls.map(
        (call: unknown[]) => call[0],
      );
      expect(ids.every((id) => (id as string).startsWith('email.'))).toBe(true);
    });

    it('falls back to normalized class name when no @ApModule', async () => {
      await buildTestModule(BasicService);

      const [moduleId] = mockRegistry.register.mock.calls[0];
      // BasicService -> "basic" (Service suffix stripped)
      expect(moduleId).toBe('basic.greet');
    });
  });

  // -----------------------------------------------------------------------
  // Explicit ID
  // -----------------------------------------------------------------------

  describe('explicit ID', () => {
    it('uses explicit id from @ApTool options', async () => {
      await buildTestModule(ExplicitIdService);

      const [moduleId] = mockRegistry.register.mock.calls[0];
      expect(moduleId).toBe('billing.charge_card');
    });
  });

  // -----------------------------------------------------------------------
  // Context injection
  // -----------------------------------------------------------------------

  describe('@ApContext injection', () => {
    it('injects context at the correct parameter position (second param)', async () => {
      await buildTestModule(ContextService);

      expect(mockRegistry.register).toHaveBeenCalledTimes(1);
      const [, registeredModule] = mockRegistry.register.mock.calls[0];

      const fakeContext = { traceId: 'abc' };
      const result = await registeredModule.execute(
        { key: 'value' },
        fakeContext,
      );

      expect(result).toEqual({
        input: { key: 'value' },
        ctx: fakeContext,
      });
    });

    it('injects context at first parameter position', async () => {
      await buildTestModule(ContextFirstService);

      expect(mockRegistry.register).toHaveBeenCalledTimes(1);
      const [, registeredModule] = mockRegistry.register.mock.calls[0];

      const fakeContext = { traceId: 'xyz' };
      const result = await registeredModule.execute(
        { data: 'test' },
        fakeContext,
      );

      expect(result).toEqual({
        input: { data: 'test' },
        ctx: fakeContext,
      });
    });

    it('does not pass context when @ApContext is not used', async () => {
      await buildTestModule(BasicService);

      const [, registeredModule] = mockRegistry.register.mock.calls[0];

      const result = await registeredModule.execute(
        { name: 'World' },
        { traceId: 'ignored' },
      );

      expect(result).toEqual({ message: 'Hello, World!' });
    });
  });

  // -----------------------------------------------------------------------
  // Schema extraction
  // -----------------------------------------------------------------------

  describe('schema handling', () => {
    it('uses explicit schemas from @ApTool options', async () => {
      await buildTestModule(SchemaService);

      const [, registeredModule] = mockRegistry.register.mock.calls[0];
      // TypeBox adapter now returns the original schema (preserving Symbol keys)
      // so we compare JSON-serializable structure.
      expect(JSON.stringify(registeredModule.inputSchema)).toBe(
        JSON.stringify(t.Object({ query: t.String() })),
      );
      expect(JSON.stringify(registeredModule.outputSchema)).toBe(
        JSON.stringify(t.Object({ results: t.Array(t.String()) })),
      );
    });

    it('defaults to Type.Object({}) when no schema provided', async () => {
      await buildTestModule(BasicService);

      const [, registeredModule] = mockRegistry.register.mock.calls[0];
      expect(registeredModule.inputSchema).toEqual(t.Object({}));
      expect(registeredModule.outputSchema).toEqual(t.Object({}));
    });
  });

  // -----------------------------------------------------------------------
  // Return value normalization
  // -----------------------------------------------------------------------

  describe('return value normalization', () => {
    it('normalizes null return to {}', async () => {
      await buildTestModule(NullReturnService);

      const nullCall = mockRegistry.register.mock.calls.find(
        (call: unknown[]) => call[0] === 'null_return.do_null',
      );
      expect(nullCall).toBeDefined();
      const result = await nullCall![1].execute({}, {});
      expect(result).toEqual({});
    });

    it('normalizes undefined return to {}', async () => {
      await buildTestModule(NullReturnService);

      const undefinedCall = mockRegistry.register.mock.calls.find(
        (call: unknown[]) => call[0] === 'null_return.do_undefined',
      );
      expect(undefinedCall).toBeDefined();
      const result = await undefinedCall![1].execute({}, {});
      expect(result).toEqual({});
    });

    it('wraps string return in { result: value }', async () => {
      await buildTestModule(NullReturnService);

      const stringCall = mockRegistry.register.mock.calls.find(
        (call: unknown[]) => call[0] === 'null_return.do_string',
      );
      expect(stringCall).toBeDefined();
      const result = await stringCall![1].execute({}, {});
      expect(result).toEqual({ result: 'hello' });
    });

    it('wraps number return in { result: value }', async () => {
      await buildTestModule(NullReturnService);

      const numberCall = mockRegistry.register.mock.calls.find(
        (call: unknown[]) => call[0] === 'null_return.do_number',
      );
      expect(numberCall).toBeDefined();
      const result = await numberCall![1].execute({}, {});
      expect(result).toEqual({ result: 42 });
    });

    it('passes object return as-is', async () => {
      await buildTestModule(BasicService);

      const [, registeredModule] = mockRegistry.register.mock.calls[0];
      const result = await registeredModule.execute({ name: 'Test' }, {});
      expect(result).toEqual({ message: 'Hello, Test!' });
    });
  });

  // -----------------------------------------------------------------------
  // Module metadata (annotations, tags)
  // -----------------------------------------------------------------------

  describe('module metadata', () => {
    it('passes description from @ApTool options', async () => {
      await buildTestModule(BasicService);

      const [, registeredModule] = mockRegistry.register.mock.calls[0];
      expect(registeredModule.description).toBe('Say hello');
    });

    it('passes annotations and tags from @ApTool options', async () => {
      await buildTestModule(AnnotatedModuleService);

      const [, registeredModule] = mockRegistry.register.mock.calls[0];
      expect(registeredModule.annotations).toEqual({ destructive: true });
      expect(registeredModule.tags).toEqual(['tool-tag']);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple providers
  // -----------------------------------------------------------------------

  describe('multiple providers', () => {
    it('scans multiple providers in one module', async () => {
      await buildTestModule(BasicService, EmailService, ExplicitIdService);

      // BasicService: 1, EmailService: 2, ExplicitIdService: 1 = 4 total
      expect(mockRegistry.register).toHaveBeenCalledTimes(4);
    });
  });
});
