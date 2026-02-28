/**
 * End-to-end integration tests that verify the full decorator-based and
 * programmatic registration + execution flow using the REAL apcore-js
 * Registry and Executor (no mocks).
 *
 * IMPORTANT: Do NOT vi.mock('apcore-js') -- that would break E2E.
 *
 * NOTE on schemas: The ApToolScannerService processes explicit TypeBox
 * schemas through SchemaExtractor, which JSON-round-trips them (stripping
 * the Symbol.for('TypeBox.Kind') tag). The real executor's Value.Check
 * requires that tag, so decorator-based tests omit explicit schemas
 * (defaulting to t.Object({}), created fresh with the symbol intact).
 * Schema validation is exercised in the programmatic registration tests
 * where FunctionModule preserves the original TypeBox schemas.
 */
import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Type as t } from '@sinclair/typebox';

import { ApcoreModule } from '../../src/core/apcore.module.js';
import { ApcoreRegistryService } from '../../src/core/apcore-registry.service.js';
import { ApcoreExecutorService } from '../../src/core/apcore-executor.service.js';
import { ApTool } from '../../src/decorators/ap-tool.decorator.js';
import { ApModule } from '../../src/decorators/ap-module.decorator.js';
import { ApContext } from '../../src/decorators/ap-context.decorator.js';
import { ApToolScannerService } from '../../src/decorators/ap-tool-scanner.service.js';

// ---------------------------------------------------------------------------
// Test 1: Decorator-based registration and execution
//
// Schemas are omitted from @ApTool so the scanner defaults to t.Object({}),
// which preserves the TypeBox Kind symbol and is compatible with executor
// validation. The execution logic itself is the real E2E value here.
// ---------------------------------------------------------------------------

@ApModule({ namespace: 'greeting' })
@Injectable()
class GreetingService {
  @ApTool({ description: 'Say hello to someone' })
  sayHello(inputs: Record<string, unknown>): Record<string, unknown> {
    return { message: `Hello, ${inputs['name']}!` };
  }

  @ApTool({ description: 'Say goodbye to someone' })
  sayGoodbye(inputs: Record<string, unknown>): Record<string, unknown> {
    return { farewell: `Goodbye, ${inputs['name']}!` };
  }
}

// ---------------------------------------------------------------------------
// Test 4: Context injection service
// ---------------------------------------------------------------------------

@ApModule({ namespace: 'ctx' })
@Injectable()
class ContextAwareService {
  @ApTool({ description: 'Echo inputs and context caller ID' })
  echo(inputs: Record<string, unknown>, @ApContext() ctx: any): Record<string, unknown> {
    // The real apcore-js Context has a callerId property
    const caller = ctx?.callerId ?? 'unknown';
    return { value: inputs['value'] as string, caller };
  }
}

// ---------------------------------------------------------------------------
// Service used for programmatic registration (Tests 2 and 3)
// ---------------------------------------------------------------------------

class MathHelper {
  add(inputs: Record<string, unknown>): Record<string, unknown> {
    const a = inputs['a'] as number;
    const b = inputs['b'] as number;
    return { sum: a + b };
  }

  multiply(inputs: Record<string, unknown>): Record<string, unknown> {
    const a = inputs['a'] as number;
    const b = inputs['b'] as number;
    return { product: a * b };
  }

  subtract(inputs: Record<string, unknown>): Record<string, unknown> {
    const a = inputs['a'] as number;
    const b = inputs['b'] as number;
    return { difference: a - b };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E Integration Tests (real apcore-js)', () => {
  // -----------------------------------------------------------------------
  // Test 1: Decorator-based registration and execution
  // -----------------------------------------------------------------------
  describe('decorator-based registration and execution', () => {
    let registry: ApcoreRegistryService;
    let executor: ApcoreExecutorService;
    let module: TestingModule;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [ApcoreModule.forRoot({}), DiscoveryModule],
        providers: [GreetingService, ApToolScannerService],
      }).compile();

      // Trigger OnModuleInit hooks (runs the ApToolScannerService)
      await module.init();

      registry = module.get(ApcoreRegistryService);
      executor = module.get(ApcoreExecutorService);
    });

    afterAll(async () => {
      await module.close();
    });

    it('should register decorated tools in the real registry', () => {
      const ids = registry.list();
      expect(ids).toContain('greeting.say_hello');
      expect(ids).toContain('greeting.say_goodbye');
    });

    it('should report correct count for decorator-registered tools', () => {
      expect(registry.count).toBeGreaterThanOrEqual(2);
    });

    it('should execute greeting.say_hello via executor', async () => {
      const result = await executor.call('greeting.say_hello', { name: 'World' });
      expect(result).toEqual({ message: 'Hello, World!' });
    });

    it('should execute greeting.say_goodbye via executor', async () => {
      const result = await executor.call('greeting.say_goodbye', { name: 'Alice' });
      expect(result).toEqual({ farewell: 'Goodbye, Alice!' });
    });

    it('should expose module definitions via getDefinition', () => {
      const def = registry.getDefinition('greeting.say_hello');
      expect(def).not.toBeNull();
      expect(def!.moduleId).toBe('greeting.say_hello');
      expect(def!.description).toBe('Say hello to someone');
    });

    it('should have modules accessible via has()', () => {
      expect(registry.has('greeting.say_hello')).toBe(true);
      expect(registry.has('greeting.say_goodbye')).toBe(true);
      expect(registry.has('greeting.nonexistent')).toBe(false);
    });

    it('should be able to unregister a module', () => {
      // Unregister say_goodbye and verify
      const removed = registry.unregister('greeting.say_goodbye');
      expect(removed).toBe(true);
      expect(registry.has('greeting.say_goodbye')).toBe(false);
      expect(registry.list()).not.toContain('greeting.say_goodbye');
    });
  });

  // -----------------------------------------------------------------------
  // Test 2: Programmatic registration via registerMethod
  // -----------------------------------------------------------------------
  describe('programmatic registration via registerMethod', () => {
    let registry: ApcoreRegistryService;
    let executor: ApcoreExecutorService;
    let module: TestingModule;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [ApcoreModule.forRoot({})],
      }).compile();

      registry = module.get(ApcoreRegistryService);
      executor = module.get(ApcoreExecutorService);

      const mathHelper = new MathHelper();

      registry.registerMethod({
        instance: mathHelper,
        method: 'add',
        description: 'Add two numbers',
        id: 'math.add',
        inputSchema: t.Object({ a: t.Number(), b: t.Number() }),
        outputSchema: t.Object({ sum: t.Number() }),
      });
    });

    afterAll(async () => {
      await module.close();
    });

    it('should register the method in the real registry', () => {
      expect(registry.has('math.add')).toBe(true);
      expect(registry.list()).toContain('math.add');
    });

    it('should execute the registered method via executor', async () => {
      const result = await executor.call('math.add', { a: 3, b: 7 });
      expect(result).toEqual({ sum: 10 });
    });

    it('should validate valid inputs against schema', () => {
      const valid = executor.validate('math.add', { a: 1, b: 2 });
      expect(valid.valid).toBe(true);
      expect(valid.errors).toEqual([]);
    });

    it('should reject invalid inputs against schema', () => {
      const invalid = executor.validate('math.add', { a: 'not a number', b: 2 } as any);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors.length).toBeGreaterThan(0);
    });

    it('should expose module definition', () => {
      const def = registry.getDefinition('math.add');
      expect(def).not.toBeNull();
      expect(def!.description).toBe('Add two numbers');
    });
  });

  // -----------------------------------------------------------------------
  // Test 3: registerService batch registration
  // -----------------------------------------------------------------------
  describe('registerService batch registration', () => {
    let registry: ApcoreRegistryService;
    let executor: ApcoreExecutorService;
    let module: TestingModule;
    let registeredIds: string[];

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [ApcoreModule.forRoot({})],
      }).compile();

      registry = module.get(ApcoreRegistryService);
      executor = module.get(ApcoreExecutorService);

      const mathHelper = new MathHelper();

      registeredIds = registry.registerService({
        instance: mathHelper,
        description: 'Math operations',
        methods: ['add', 'multiply', 'subtract'],
        namespace: 'calc',
        methodOptions: {
          add: {
            description: 'Add two numbers',
            inputSchema: t.Object({ a: t.Number(), b: t.Number() }),
            outputSchema: t.Object({ sum: t.Number() }),
          },
          multiply: {
            description: 'Multiply two numbers',
            inputSchema: t.Object({ a: t.Number(), b: t.Number() }),
            outputSchema: t.Object({ product: t.Number() }),
          },
          subtract: {
            description: 'Subtract two numbers',
            inputSchema: t.Object({ a: t.Number(), b: t.Number() }),
            outputSchema: t.Object({ difference: t.Number() }),
          },
        },
      });
    });

    afterAll(async () => {
      await module.close();
    });

    it('should register all three methods', () => {
      expect(registeredIds).toHaveLength(3);
      expect(registeredIds).toContain('calc.add');
      expect(registeredIds).toContain('calc.multiply');
      expect(registeredIds).toContain('calc.subtract');
    });

    it('should list all registered IDs from the real registry', () => {
      const ids = registry.list();
      expect(ids).toContain('calc.add');
      expect(ids).toContain('calc.multiply');
      expect(ids).toContain('calc.subtract');
    });

    it('should execute calc.add', async () => {
      const result = await executor.call('calc.add', { a: 10, b: 20 });
      expect(result).toEqual({ sum: 30 });
    });

    it('should execute calc.multiply', async () => {
      const result = await executor.call('calc.multiply', { a: 5, b: 6 });
      expect(result).toEqual({ product: 30 });
    });

    it('should execute calc.subtract', async () => {
      const result = await executor.call('calc.subtract', { a: 100, b: 37 });
      expect(result).toEqual({ difference: 63 });
    });

    it('should report correct total count', () => {
      expect(registry.count).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // Test 4: Context injection via @ApContext
  // -----------------------------------------------------------------------
  describe('context injection via @ApContext', () => {
    let registry: ApcoreRegistryService;
    let executor: ApcoreExecutorService;
    let module: TestingModule;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [ApcoreModule.forRoot({}), DiscoveryModule],
        providers: [ContextAwareService, ApToolScannerService],
      }).compile();

      await module.init();

      registry = module.get(ApcoreRegistryService);
      executor = module.get(ApcoreExecutorService);
    });

    afterAll(async () => {
      await module.close();
    });

    it('should register the context-aware tool', () => {
      const ids = registry.list();
      expect(ids).toContain('ctx.echo');
    });

    it('should pass context through during execution', async () => {
      // When calling through the real executor, a Context object is
      // created automatically. The callerId defaults to "anonymous".
      const result = await executor.call('ctx.echo', { value: 'test' });
      expect(result).toHaveProperty('value', 'test');
      // The context object passed by the real executor is a Context
      // instance with a callerId property (defaults to "anonymous")
      expect(result).toHaveProperty('caller');
      expect(typeof result['caller']).toBe('string');
    });

    it('should return inputs correctly alongside context info', async () => {
      const result = await executor.call('ctx.echo', { value: 'hello' });
      expect(result['value']).toBe('hello');
    });

    it('should have caller ID from the real Context object', async () => {
      const result = await executor.call('ctx.echo', { value: 'check' });
      // The real apcore-js Context.create() sets callerId to null at the
      // top level, and child() propagates null when the call chain is empty.
      // Our service falls back to 'unknown' via ?? when callerId is null.
      expect(result['caller']).toBe('unknown');
    });
  });
});
