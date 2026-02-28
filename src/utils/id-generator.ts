/**
 * NestJS suffixes to strip from class names during normalization.
 */
const NESTJS_SUFFIXES = [
  'Service',
  'Controller',
  'Handler',
  'Module',
  'Provider',
  'Gateway',
  'Guard',
  'Interceptor',
  'Pipe',
  'Filter',
];

/**
 * Convert a PascalCase or camelCase string to snake_case.
 *
 * Handles consecutive uppercase letters (acronyms) by inserting an
 * underscore before the last uppercase letter of the run when followed
 * by a lowercase letter.  For example: "HTTPClient" -> "http_client".
 */
function toSnakeCase(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Normalize a NestJS class name by stripping common framework suffixes
 * and converting the remainder from PascalCase to snake_case.
 *
 * If the name consists *only* of a suffix (e.g. "Service"), it is
 * returned as-is in lowercase rather than producing an empty string.
 *
 * @example
 * normalizeClassName('EmailService')   // 'email'
 * normalizeClassName('MyGreatService') // 'my_great'
 * normalizeClassName('HTTPClient')     // 'http_client'
 * normalizeClassName('email')          // 'email'
 */
export function normalizeClassName(name: string): string {
  let stripped = name;

  for (const suffix of NESTJS_SUFFIXES) {
    if (name.endsWith(suffix) && name.length > suffix.length) {
      stripped = name.slice(0, -suffix.length);
      break;
    }
  }

  return toSnakeCase(stripped);
}

/**
 * Normalize a method name by converting camelCase to snake_case.
 *
 * @example
 * normalizeMethodName('sendEmail')  // 'send_email'
 * normalizeMethodName('batchSend')  // 'batch_send'
 * normalizeMethodName('send')       // 'send'
 * normalizeMethodName('send_email') // 'send_email'
 */
export function normalizeMethodName(name: string): string {
  return toSnakeCase(name);
}

/**
 * Generate a fully-qualified module ID in the form "namespace.method".
 *
 * @param namespace  - The class / namespace portion of the ID.
 * @param method     - The method portion of the ID.
 * @param normalizeInputs - When true, applies {@link normalizeClassName}
 *   to `namespace` and {@link normalizeMethodName} to `method`.
 * @param explicitId - If provided (non-null), returned as-is, bypassing
 *   all generation logic.
 *
 * @example
 * generateModuleId('email', 'send')                          // 'email.send'
 * generateModuleId('EmailService', 'sendEmail', true)        // 'email.send_email'
 * generateModuleId('any', 'thing', false, 'custom.override') // 'custom.override'
 */
export function generateModuleId(
  namespace: string,
  method: string,
  normalizeInputs?: boolean,
  explicitId?: string | null,
): string {
  if (explicitId != null) {
    return explicitId;
  }

  const ns = normalizeInputs ? normalizeClassName(namespace) : namespace;
  const m = normalizeInputs ? normalizeMethodName(method) : method;

  return `${ns}.${m}`;
}
