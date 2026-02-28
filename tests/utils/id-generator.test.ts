import {
  normalizeClassName,
  normalizeMethodName,
  generateModuleId,
} from '../../src/utils/id-generator.js';

describe('normalizeClassName', () => {
  it('strips Service suffix and converts to snake_case', () => {
    expect(normalizeClassName('EmailService')).toBe('email');
  });

  it('strips Controller suffix', () => {
    expect(normalizeClassName('UserController')).toBe('user');
  });

  it('strips Handler suffix', () => {
    expect(normalizeClassName('OrderHandler')).toBe('order');
  });

  it('strips Module suffix', () => {
    expect(normalizeClassName('PaymentModule')).toBe('payment');
  });

  it('strips Provider suffix', () => {
    expect(normalizeClassName('CacheProvider')).toBe('cache');
  });

  it('strips Gateway suffix', () => {
    expect(normalizeClassName('WebSocketGateway')).toBe('web_socket');
  });

  it('strips Guard suffix', () => {
    expect(normalizeClassName('AuthGuard')).toBe('auth');
  });

  it('strips Interceptor suffix', () => {
    expect(normalizeClassName('LoggingInterceptor')).toBe('logging');
  });

  it('strips Pipe suffix', () => {
    expect(normalizeClassName('ValidationPipe')).toBe('validation');
  });

  it('strips Filter suffix', () => {
    expect(normalizeClassName('ExceptionFilter')).toBe('exception');
  });

  it('converts multi-word PascalCase to snake_case', () => {
    expect(normalizeClassName('MyGreatService')).toBe('my_great');
  });

  it('handles uppercase acronyms', () => {
    expect(normalizeClassName('HTTPClient')).toBe('http_client');
  });

  it('returns lowercase string unchanged', () => {
    expect(normalizeClassName('email')).toBe('email');
  });

  it('handles a name that is only a suffix', () => {
    expect(normalizeClassName('Service')).toBe('service');
  });

  it('handles multi-word PascalCase without suffix', () => {
    expect(normalizeClassName('MyGreatHelper')).toBe('my_great_helper');
  });

  it('handles single word PascalCase without suffix', () => {
    expect(normalizeClassName('Email')).toBe('email');
  });
});

describe('normalizeMethodName', () => {
  it('converts camelCase to snake_case', () => {
    expect(normalizeMethodName('sendEmail')).toBe('send_email');
  });

  it('converts multi-word camelCase', () => {
    expect(normalizeMethodName('batchSend')).toBe('batch_send');
  });

  it('returns single word unchanged', () => {
    expect(normalizeMethodName('send')).toBe('send');
  });

  it('preserves existing snake_case', () => {
    expect(normalizeMethodName('send_email')).toBe('send_email');
  });

  it('handles uppercase acronyms in method names', () => {
    expect(normalizeMethodName('parseJSON')).toBe('parse_json');
  });

  it('handles leading lowercase with acronym', () => {
    expect(normalizeMethodName('getHTTPResponse')).toBe('get_http_response');
  });
});

describe('generateModuleId', () => {
  it('joins namespace and method with a dot', () => {
    expect(generateModuleId('email', 'send')).toBe('email.send');
  });

  it('returns explicitId when provided', () => {
    expect(generateModuleId('email', 'send', false, 'custom.id')).toBe(
      'custom.id',
    );
  });

  it('returns explicitId even if normalizeInputs is true', () => {
    expect(generateModuleId('EmailService', 'sendEmail', true, 'override')).toBe(
      'override',
    );
  });

  it('normalizes inputs when normalizeInputs is true', () => {
    expect(generateModuleId('EmailService', 'sendEmail', true)).toBe(
      'email.send_email',
    );
  });

  it('does not normalize inputs when normalizeInputs is false', () => {
    expect(generateModuleId('EmailService', 'sendEmail', false)).toBe(
      'EmailService.sendEmail',
    );
  });

  it('does not normalize inputs by default', () => {
    expect(generateModuleId('EmailService', 'sendEmail')).toBe(
      'EmailService.sendEmail',
    );
  });

  it('ignores null explicitId', () => {
    expect(generateModuleId('email', 'send', false, null)).toBe('email.send');
  });

  it('normalizes both namespace and method when normalizeInputs is true', () => {
    expect(generateModuleId('MyGreatService', 'batchSend', true)).toBe(
      'my_great.batch_send',
    );
  });
});
