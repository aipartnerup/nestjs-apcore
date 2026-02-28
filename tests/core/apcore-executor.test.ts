import type { Executor } from 'apcore-js';
import type { Context } from 'apcore-js';
import { ApcoreExecutorService } from '../../src/core/apcore-executor.service.js';

// ---------------------------------------------------------------------------
// Helper: create a mock Executor with spied methods
// ---------------------------------------------------------------------------
function createMockExecutor(): {
  mock: Executor;
  callSpy: ReturnType<typeof vi.fn>;
  streamSpy: ReturnType<typeof vi.fn>;
  validateSpy: ReturnType<typeof vi.fn>;
} {
  const callSpy = vi.fn();
  const streamSpy = vi.fn();
  const validateSpy = vi.fn();

  const mock = {
    call: callSpy,
    stream: streamSpy,
    validate: validateSpy,
  } as unknown as Executor;

  return { mock, callSpy, streamSpy, validateSpy };
}

describe('ApcoreExecutorService', () => {
  let service: ApcoreExecutorService;
  let callSpy: ReturnType<typeof vi.fn>;
  let streamSpy: ReturnType<typeof vi.fn>;
  let validateSpy: ReturnType<typeof vi.fn>;
  let mockExecutor: Executor;

  beforeEach(() => {
    const mocks = createMockExecutor();
    mockExecutor = mocks.mock;
    callSpy = mocks.callSpy;
    streamSpy = mocks.streamSpy;
    validateSpy = mocks.validateSpy;
    service = new ApcoreExecutorService(mockExecutor);
  });

  // -------------------------------------------------------------------------
  // raw getter
  // -------------------------------------------------------------------------
  describe('raw', () => {
    it('returns the underlying Executor instance', () => {
      expect(service.raw).toBe(mockExecutor);
    });
  });

  // -------------------------------------------------------------------------
  // call()
  // -------------------------------------------------------------------------
  describe('call', () => {
    it('delegates to executor.call() with provided inputs', async () => {
      const expected = { result: 'ok' };
      callSpy.mockResolvedValueOnce(expected);

      const result = await service.call('mod.action', { key: 'value' });

      expect(callSpy).toHaveBeenCalledWith('mod.action', { key: 'value' }, undefined);
      expect(result).toEqual(expected);
    });

    it('normalizes null inputs to empty object', async () => {
      callSpy.mockResolvedValueOnce({});

      await service.call('mod.action', null);

      expect(callSpy).toHaveBeenCalledWith('mod.action', {}, undefined);
    });

    it('normalizes undefined inputs to empty object', async () => {
      callSpy.mockResolvedValueOnce({});

      await service.call('mod.action');

      expect(callSpy).toHaveBeenCalledWith('mod.action', {}, undefined);
    });

    it('passes context through to executor.call()', async () => {
      callSpy.mockResolvedValueOnce({});
      const ctx = { identity: { sub: 'user-1' } } as unknown as Context;

      await service.call('mod.action', { a: 1 }, ctx);

      expect(callSpy).toHaveBeenCalledWith('mod.action', { a: 1 }, ctx);
    });

    it('propagates errors from executor.call()', async () => {
      callSpy.mockRejectedValueOnce(new Error('boom'));

      await expect(service.call('mod.fail')).rejects.toThrow('boom');
    });
  });

  // -------------------------------------------------------------------------
  // stream()
  // -------------------------------------------------------------------------
  describe('stream', () => {
    it('yields chunks from executor.stream()', async () => {
      async function* fakeStream() {
        yield { chunk: 1 };
        yield { chunk: 2 };
        yield { chunk: 3 };
      }
      streamSpy.mockReturnValueOnce(fakeStream());

      const chunks: Record<string, unknown>[] = [];
      for await (const chunk of service.stream('mod.stream', { q: 'hello' })) {
        chunks.push(chunk);
      }

      expect(streamSpy).toHaveBeenCalledWith('mod.stream', { q: 'hello' }, undefined);
      expect(chunks).toEqual([{ chunk: 1 }, { chunk: 2 }, { chunk: 3 }]);
    });

    it('normalizes null inputs to empty object', async () => {
      async function* empty() {
        // no-op
      }
      streamSpy.mockReturnValueOnce(empty());

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of service.stream('mod.stream', null)) {
        // drain
      }

      expect(streamSpy).toHaveBeenCalledWith('mod.stream', {}, undefined);
    });

    it('normalizes undefined inputs to empty object', async () => {
      async function* empty() {
        // no-op
      }
      streamSpy.mockReturnValueOnce(empty());

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of service.stream('mod.stream')) {
        // drain
      }

      expect(streamSpy).toHaveBeenCalledWith('mod.stream', {}, undefined);
    });

    it('passes context through to executor.stream()', async () => {
      async function* empty() {
        // no-op
      }
      streamSpy.mockReturnValueOnce(empty());
      const ctx = { identity: { sub: 'user-2' } } as unknown as Context;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of service.stream('mod.stream', { a: 1 }, ctx)) {
        // drain
      }

      expect(streamSpy).toHaveBeenCalledWith('mod.stream', { a: 1 }, ctx);
    });

    it('propagates errors from executor.stream()', async () => {
      async function* failing(): AsyncGenerator<Record<string, unknown>> {
        throw new Error('stream-boom');
      }
      streamSpy.mockReturnValueOnce(failing());

      const chunks: Record<string, unknown>[] = [];
      await expect(async () => {
        for await (const chunk of service.stream('mod.fail')) {
          chunks.push(chunk);
        }
      }).rejects.toThrow('stream-boom');
    });
  });

  // -------------------------------------------------------------------------
  // validate()
  // -------------------------------------------------------------------------
  describe('validate', () => {
    it('delegates to executor.validate() and returns the result', () => {
      const expected = { valid: true, errors: [] };
      validateSpy.mockReturnValueOnce(expected);

      const result = service.validate('mod.action', { key: 'value' });

      expect(validateSpy).toHaveBeenCalledWith('mod.action', { key: 'value' });
      expect(result).toEqual(expected);
    });

    it('returns validation errors when present', () => {
      const expected = {
        valid: false,
        errors: [{ field: 'key', message: 'required' }],
      };
      validateSpy.mockReturnValueOnce(expected);

      const result = service.validate('mod.action', {});

      expect(result).toEqual(expected);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('propagates errors from executor.validate()', () => {
      validateSpy.mockImplementationOnce(() => {
        throw new Error('validate-boom');
      });

      expect(() => service.validate('mod.fail', {})).toThrow('validate-boom');
    });
  });
});
