import 'reflect-metadata';
import { ApTool } from '../../src/decorators/ap-tool.decorator.js';
import { ApModule } from '../../src/decorators/ap-module.decorator.js';
import { ApContext } from '../../src/decorators/ap-context.decorator.js';
import {
  AP_TOOL_METADATA_KEY,
  AP_MODULE_METADATA_KEY,
  AP_CONTEXT_METADATA_KEY,
} from '../../src/constants.js';
import type { ApToolOptions, ApModuleOptions } from '../../src/types.js';

// ---------------------------------------------------------------------------
// @ApTool
// ---------------------------------------------------------------------------

describe('@ApTool', () => {
  it('stores metadata on the method with all fields', () => {
    const options: ApToolOptions = {
      description: 'Fetches user by ID',
      annotations: {
        readonly: true,
        destructive: false,
        idempotent: true,
        requiresApproval: false,
        openWorld: false,
        streaming: false,
      },
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      tags: ['user', 'read'],
      documentation: 'https://docs.example.com/getUser',
      examples: [
        {
          title: 'basic lookup',
          inputs: { id: '123' },
          output: { name: 'Alice' },
          description: 'Looks up user 123',
        },
      ],
    };

    class TestService {
      @ApTool(options)
      getUser(_id: string) {
        return {};
      }
    }

    const stored = Reflect.getMetadata(
      AP_TOOL_METADATA_KEY,
      TestService.prototype,
      'getUser',
    );

    expect(stored).toEqual(options);
    expect(stored.description).toBe('Fetches user by ID');
    expect(stored.annotations?.readonly).toBe(true);
    expect(stored.inputSchema).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    });
    expect(stored.tags).toEqual(['user', 'read']);
    expect(stored.documentation).toBe('https://docs.example.com/getUser');
    expect(stored.examples).toHaveLength(1);
    expect(stored.examples[0].title).toBe('basic lookup');
  });

  it('stores metadata with only required fields', () => {
    class MinimalService {
      @ApTool({ description: 'minimal' })
      doWork() {
        return;
      }
    }

    const stored = Reflect.getMetadata(
      AP_TOOL_METADATA_KEY,
      MinimalService.prototype,
      'doWork',
    );

    expect(stored).toBeDefined();
    expect(stored.description).toBe('minimal');
    expect(stored.annotations).toBeUndefined();
    expect(stored.tags).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// @ApModule
// ---------------------------------------------------------------------------

describe('@ApModule', () => {
  it('stores metadata on the class with all fields', () => {
    const options: ApModuleOptions = {
      namespace: 'users',
      description: 'User management module',
      tags: ['user', 'admin'],
      annotations: {
        readonly: false,
        destructive: true,
      },
    };

    @ApModule(options)
    class UserModule {}

    const stored = Reflect.getMetadata(AP_MODULE_METADATA_KEY, UserModule);

    expect(stored).toEqual(options);
    expect(stored.namespace).toBe('users');
    expect(stored.description).toBe('User management module');
    expect(stored.tags).toEqual(['user', 'admin']);
    expect(stored.annotations?.destructive).toBe(true);
  });

  it('stores metadata with only required fields', () => {
    @ApModule({ namespace: 'minimal' })
    class MinimalModule {}

    const stored = Reflect.getMetadata(AP_MODULE_METADATA_KEY, MinimalModule);

    expect(stored).toBeDefined();
    expect(stored.namespace).toBe('minimal');
    expect(stored.description).toBeUndefined();
    expect(stored.tags).toBeUndefined();
    expect(stored.annotations).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// @ApContext
// ---------------------------------------------------------------------------

describe('@ApContext', () => {
  it('stores the parameter index on the method', () => {
    class ContextService {
      doWork(_input: string, @ApContext() _ctx: unknown) {
        return;
      }
    }

    const index = Reflect.getMetadata(
      AP_CONTEXT_METADATA_KEY,
      ContextService.prototype,
      'doWork',
    );

    expect(index).toBe(1);
  });

  it('stores parameter index 0 when context is the first parameter', () => {
    class FirstParamService {
      handle(@ApContext() _ctx: unknown, _data: string) {
        return;
      }
    }

    const index = Reflect.getMetadata(
      AP_CONTEXT_METADATA_KEY,
      FirstParamService.prototype,
      'handle',
    );

    expect(index).toBe(0);
  });
});
