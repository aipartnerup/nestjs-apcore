import type { TSchema } from '@sinclair/typebox';
import type { SchemaAdapter } from './schema-adapter.interface.js';

// ---------------------------------------------------------------------------
// Helpers — introspect Zod internals without importing Zod at runtime
// ---------------------------------------------------------------------------

/** Loose shape of a Zod schema's `_def` object. */
interface ZodDef {
  typeName?: string;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** Minimal interface we rely on — avoids hard-coupling to Zod types. */
interface ZodLike {
  _def: ZodDef;
  safeParse: (input: unknown) => unknown;
}

function isZodLike(input: unknown): input is ZodLike {
  if (input === null || input === undefined) return false;
  if (typeof input !== 'object') return false;
  const obj = input as Record<string, unknown>;
  return (
    '_def' in obj &&
    obj['_def'] !== null &&
    typeof obj['_def'] === 'object' &&
    'safeParse' in obj &&
    typeof obj['safeParse'] === 'function'
  );
}

// ---------------------------------------------------------------------------
// Recursive Zod → JSON Schema conversion
// ---------------------------------------------------------------------------

function convertZodToJsonSchema(zodSchema: ZodLike): Record<string, unknown> {
  const def = zodSchema._def;
  const typeName: string = def.typeName ?? '';
  let result: Record<string, unknown> = {};

  switch (typeName) {
    case 'ZodString': {
      result = { type: 'string' };
      break;
    }

    case 'ZodNumber': {
      result = convertZodNumber(def);
      break;
    }

    case 'ZodBoolean': {
      result = { type: 'boolean' };
      break;
    }

    case 'ZodObject': {
      result = convertZodObject(def);
      break;
    }

    case 'ZodArray': {
      const itemSchema = def.type as ZodLike;
      result = { type: 'array', items: convertZodToJsonSchema(itemSchema) };
      break;
    }

    case 'ZodEnum': {
      const values = def.values as string[];
      result = { type: 'string', enum: [...values] };
      break;
    }

    case 'ZodNativeEnum': {
      const enumObj = def.values as Record<string, string | number>;
      // Filter out reverse-mapped numeric keys (TypeScript numeric enums
      // produce { 0: 'Red', Red: 0 } — we want only the string-keyed values).
      const vals = Object.values(enumObj).filter((v) => {
        if (typeof v === 'number') {
          // Keep the value if its reverse-lookup key does not map back
          return !(String(v) in enumObj);
        }
        return true;
      });
      result = { type: 'string', enum: vals };
      break;
    }

    case 'ZodOptional': {
      const inner = def.innerType as ZodLike;
      result = convertZodToJsonSchema(inner);
      break;
    }

    case 'ZodNullable': {
      const inner = def.innerType as ZodLike;
      result = { ...convertZodToJsonSchema(inner), nullable: true };
      break;
    }

    case 'ZodDefault': {
      const inner = def.innerType as ZodLike;
      const defaultValue = def.defaultValue();
      result = { ...convertZodToJsonSchema(inner), default: defaultValue };
      break;
    }

    case 'ZodLiteral': {
      const value = def.value as string | number | boolean;
      result = { type: typeof value, const: value };
      break;
    }

    case 'ZodUnion': {
      const options = def.options as ZodLike[];
      result = { anyOf: options.map((opt) => convertZodToJsonSchema(opt)) };
      break;
    }

    case 'ZodRecord': {
      const valueType = def.valueType as ZodLike;
      result = {
        type: 'object',
        additionalProperties: convertZodToJsonSchema(valueType),
      };
      break;
    }

    case 'ZodEffects': {
      const inner = def.schema as ZodLike;
      result = convertZodToJsonSchema(inner);
      break;
    }

    default: {
      // Fallback — return an empty schema
      result = {};
      break;
    }
  }

  // Attach description if present on the def
  if (def.description) {
    result['description'] = def.description;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sub-converters
// ---------------------------------------------------------------------------

function convertZodNumber(def: ZodDef): Record<string, unknown> {
  const checks: Array<{ kind: string; value?: number }> = def.checks ?? [];
  let type: string = 'number';
  const result: Record<string, unknown> = {};

  for (const check of checks) {
    switch (check.kind) {
      case 'int':
        type = 'integer';
        break;
      case 'min':
        result['minimum'] = check.value;
        break;
      case 'max':
        result['maximum'] = check.value;
        break;
    }
  }

  result['type'] = type;
  return result;
}

function convertZodObject(def: ZodDef): Record<string, unknown> {
  const shape = def.shape?.() as Record<string, ZodLike> | undefined;
  if (!shape) {
    return { type: 'object' };
  }

  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const [key, fieldSchema] of Object.entries(shape)) {
    properties[key] = convertZodToJsonSchema(fieldSchema);
    const fieldTypeName = fieldSchema._def.typeName;
    if (fieldTypeName !== 'ZodOptional' && fieldTypeName !== 'ZodDefault') {
      required.push(key);
    }
  }

  const result: Record<string, unknown> = {
    type: 'object',
    properties,
  };

  if (required.length > 0) {
    result['required'] = required;
  }

  return result;
}

// ---------------------------------------------------------------------------
// ZodAdapter
// ---------------------------------------------------------------------------

/**
 * SchemaAdapter for Zod schemas.
 *
 * Converts Zod schema definitions to JSON Schema / TSchema representations
 * used internally by apcore.
 */
export class ZodAdapter implements SchemaAdapter {
  readonly name = 'zod' as const;
  readonly priority = 50;

  detect(input: unknown): boolean {
    return isZodLike(input);
  }

  extract(input: unknown): TSchema {
    const jsonSchema = this.extractJsonSchema(input);
    return jsonSchema as unknown as TSchema;
  }

  extractJsonSchema(input: unknown): Record<string, unknown> {
    if (!isZodLike(input)) {
      throw new Error('ZodAdapter.extractJsonSchema: input is not a Zod schema');
    }
    return convertZodToJsonSchema(input);
  }
}
