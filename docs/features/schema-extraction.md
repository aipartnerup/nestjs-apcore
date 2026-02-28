# Schema Extraction

## Overview

Adapter system that extracts JSON Schema from NestJS-native type definitions: class-validator DTOs, Zod schemas, and TypeBox schemas. Provides a unified `SchemaExtractor` that [@ApTool Scanner](aptool-decorator-scanner.md) and direct `register()` calls can use to convert framework-native types into apcore-compatible JSON Schema.

## Dependencies

- `apcore-typescript` — `TSchema` (TypeBox), JSON Schema types
- `@sinclair/typebox` — TypeBox schema construction
- Optional peer dependencies (user installs what they use):
  - `class-validator` + `class-transformer` — for DTO extraction
  - `zod` — for Zod extraction
  - `reflect-metadata` — for design:type metadata

## Problem

apcore-typescript requires `TSchema` (TypeBox) for `inputSchema` and `outputSchema`. NestJS developers don't use TypeBox — they use:

| NestJS Convention | Prevalence | Example |
|---|---|---|
| class-validator DTOs | Very High | `class CreateUserDto { @IsString() name: string }` |
| Zod schemas | Growing | `z.object({ name: z.string() })` |
| TypeBox schemas | Low (apcore-native) | `Type.Object({ name: Type.String() })` |
| Plain JSON Schema | Low | `{ type: 'object', properties: { name: { type: 'string' } } }` |

Without Schema Extraction, developers must manually rewrite their existing types as TypeBox schemas — doubling the type maintenance burden.

## Architecture

```
Input Sources          SchemaExtractor          Output
─────────────         ───────────────         ────────
class-validator DTO ─→ DtoAdapter ──────┐
Zod schema ──────────→ ZodAdapter ──────┤──→ JSON Schema ──→ TypeBox TSchema
TypeBox TSchema ─────→ PassthroughAdapter ┤
Plain JSON Schema ───→ JsonSchemaAdapter ─┘
```

### SchemaExtractor (Core)

Unified entry point. Detects input type and delegates to the correct adapter.

```
extract(source: unknown): TSchema
extractJsonSchema(source: unknown): JsonSchema
detect(source: unknown): 'dto' | 'zod' | 'typebox' | 'json-schema' | 'unknown'
```

**Detection logic (priority order):**

1. **TypeBox**: Has `Symbol.for('TypeBox.Kind')` property → PassthroughAdapter
2. **Zod**: Has `_def` property and `safeParse` method → ZodAdapter
3. **JSON Schema**: Plain object with `type` property at top level → JsonSchemaAdapter
4. **DTO class**: Is a class (constructor function) with class-validator metadata → DtoAdapter
5. **Unknown**: Throw `SchemaExtractionError` with clear message

## Adapters

### DtoAdapter (class-validator)

Converts class-validator decorated DTO classes to JSON Schema.

**Input:**
```typescript
class SendEmailDto {
  @IsString()
  @IsNotEmpty()
  to: string;

  @IsString()
  @MaxLength(200)
  subject: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cc?: string[];
}
```

**Output (JSON Schema):**
```json
{
  "type": "object",
  "properties": {
    "to": { "type": "string", "minLength": 1 },
    "subject": { "type": "string", "maxLength": 200 },
    "body": { "type": "string" },
    "cc": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "required": ["to", "subject", "body"]
}
```

**Implementation approach:**
- Use `class-validator`'s `getMetadataStorage()` to read validation metadata
- Use `reflect-metadata`'s `design:type` to read TypeScript type info
- Map class-validator decorators to JSON Schema constraints:

| class-validator | JSON Schema |
|---|---|
| `@IsString()` | `{ "type": "string" }` |
| `@IsNumber()` | `{ "type": "number" }` |
| `@IsBoolean()` | `{ "type": "boolean" }` |
| `@IsInt()` | `{ "type": "integer" }` |
| `@IsArray()` | `{ "type": "array" }` |
| `@IsEnum(E)` | `{ "enum": [...values] }` |
| `@IsOptional()` | Remove from `required` |
| `@MinLength(n)` | `{ "minLength": n }` |
| `@MaxLength(n)` | `{ "maxLength": n }` |
| `@Min(n)` | `{ "minimum": n }` |
| `@Max(n)` | `{ "maximum": n }` |
| `@IsNotEmpty()` | `{ "minLength": 1 }` |
| `@IsEmail()` | `{ "format": "email" }` |
| `@IsUrl()` | `{ "format": "uri" }` |
| `@IsDateString()` | `{ "format": "date-time" }` |
| `@Matches(regex)` | `{ "pattern": "..." }` |
| `@ArrayMinSize(n)` | `{ "minItems": n }` |
| `@ArrayMaxSize(n)` | `{ "maxItems": n }` |
| `@ValidateNested()` | Recursively extract nested DTO |
| `@Type(() => ChildDto)` | Resolve nested class for recursion |

**Nested DTO handling:**
```typescript
class AddressDto {
  @IsString() street: string;
  @IsString() city: string;
}

class CreateUserDto {
  @IsString() name: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;
}
```
→ `address` property recursively extracts `AddressDto` schema.

**Circular reference detection:**
Track visited classes during recursion. If a class references itself (directly or indirectly), generate a `$ref` or throw with clear message.

**Limitations:**
- Custom validators (`@Validate(CustomValidator)`) are not extractable → ignored with warning
- Conditional validation (`@ValidateIf()`) is not representable in JSON Schema → ignored
- Groups-based validation is not supported → all validators treated as active
- `design:type` reflection only provides the constructor, not generic type args. `Array<string>` is seen as `Array`. Array item types require `@IsString({ each: true })` or `@Type(() => ChildDto)`.

### ZodAdapter

Converts Zod schemas to JSON Schema.

**Implementation approach:**
- Use `zod-to-json-schema` (community package) or Zod v4's built-in `.toJsonSchema()` method (if available)
- If neither available, implement manual traversal of Zod's `_def` structure

**Supported Zod types:**

| Zod | JSON Schema |
|---|---|
| `z.string()` | `{ "type": "string" }` |
| `z.number()` | `{ "type": "number" }` |
| `z.boolean()` | `{ "type": "boolean" }` |
| `z.object({})` | `{ "type": "object", "properties": {...} }` |
| `z.array(z.string())` | `{ "type": "array", "items": { "type": "string" } }` |
| `z.enum([...])` | `{ "enum": [...] }` |
| `z.optional()` | Remove from `required` |
| `z.nullable()` | `{ "type": ["original", "null"] }` |
| `z.default(v)` | `{ "default": v }` |
| `z.min(n)` / `z.max(n)` | Constraints mapped to min/max/minLength/maxLength |
| `z.union([...])` | `{ "anyOf": [...] }` |
| `z.literal(v)` | `{ "const": v }` |
| `z.record(k, v)` | `{ "type": "object", "additionalProperties": {...} }` |

### PassthroughAdapter (TypeBox)

TypeBox schemas are already JSON Schema compatible. This adapter:
1. Validates the input is a valid TSchema (has `Symbol.for('TypeBox.Kind')`)
2. Returns it as-is (or deep clones to prevent mutation)

### JsonSchemaAdapter

Plain JSON Schema objects. This adapter:
1. Validates the object has `type: 'object'` at top level (or wraps it)
2. Converts to TypeBox TSchema via apcore-typescript's `jsonSchemaToTypeBox()`

## Integration with @ApTool Scanner

[@ApTool Scanner](aptool-decorator-scanner.md)'s `ApToolScanner` uses `SchemaExtractor` at two points:

### 1. Explicit schema in @ApTool options

```typescript
@ApTool({
  description: 'Send email',
  inputSchema: SendEmailDto,      // ← class-validator DTO
  outputSchema: z.object({ ... }), // ← Zod
})
```

Scanner calls `SchemaExtractor.extract(options.inputSchema)` → gets TSchema.

### 2. Inferred schema from method parameter type

```typescript
@ApTool({ description: 'Send email' })
async send(input: SendEmailDto): Promise<SendResult> { ... }
```

Scanner reads `Reflect.getMetadata('design:paramtypes', target, methodName)` → gets `[SendEmailDto]` → calls `SchemaExtractor.extract(SendEmailDto)`.

**Return type inference limitation:** `Reflect.getMetadata('design:returntype', ...)` returns `Promise` for async methods, losing the generic parameter `SendResult`. Options:
- Require explicit `outputSchema` for async methods
- Use a permissive output schema (`Type.Record(Type.String(), Type.Unknown())`) as fallback
- Allow `@ApTool({ outputSchema: SendResult })` override

Recommended: use permissive fallback + allow override. Output validation is less critical than input validation for MCP tools.

## Public API

### SchemaExtractor

```
class SchemaExtractor {
  extract(source: unknown): TSchema
  extractJsonSchema(source: unknown): JsonSchema
  detect(source: unknown): SchemaSourceType
  registerAdapter(type: string, adapter: SchemaAdapter): void
}

type SchemaSourceType = 'dto' | 'zod' | 'typebox' | 'json-schema' | 'unknown'

interface SchemaAdapter {
  detect(source: unknown): boolean
  toJsonSchema(source: unknown): JsonSchema
}
```

### Standalone Usage

`SchemaExtractor` is injectable and usable outside the @ApTool Scanner, for manual registration scenarios:

```typescript
@Injectable()
class MyBridge implements OnModuleInit {
  constructor(
    private registry: ApcoreRegistry,
    private schema: SchemaExtractor,
  ) {}

  onModuleInit() {
    this.registry.register('email.send', new FunctionModule({
      moduleId: 'email.send',
      description: 'Send email',
      inputSchema: this.schema.extract(SendEmailDto),   // ← auto-converts
      outputSchema: this.schema.extract(SendResultDto),
      execute: async (inputs) => { /* ... */ },
    }));
  }
}
```

## Configuration

Schema extraction is configured via `ApcoreModule`:

```typescript
ApcoreModule.forRoot({
  schema: {
    adapters: ['dto', 'zod', 'typebox', 'json-schema'],  // default: all
    // Or limit to only the ones your app uses:
    // adapters: ['dto'],
    strictOutput: false,  // default: false. If true, require explicit outputSchema
  },
})
```

Adapters are only loaded if their peer dependency is available. If `class-validator` is not installed, the DtoAdapter is silently skipped (not an error unless a DTO class is encountered).

## Error Handling

| Error | When | Message |
|---|---|---|
| Unknown schema type | `extract()` called with unrecognized input | `"Cannot extract schema from ${typeof source}. Expected: class-validator DTO, Zod schema, TypeBox schema, or JSON Schema object."` |
| Missing peer dependency | DTO class detected but `class-validator` not installed | `"class-validator is required to extract schemas from DTO classes. Install it: npm install class-validator class-transformer"` |
| Circular reference in DTO | DTO class references itself | `"Circular reference detected in DTO: ${className} → ... → ${className}. Use explicit inputSchema instead."` |
| Invalid JSON Schema | Plain object doesn't conform to JSON Schema spec | `"Invalid JSON Schema: missing 'type' property."` |

## Testing Strategy

### Unit Tests — DtoAdapter
- Simple DTO with string/number/boolean fields
- DTO with `@IsOptional()` fields → not in `required`
- DTO with constraints (`@MinLength`, `@Max`, etc.) → JSON Schema constraints
- Nested DTO with `@ValidateNested()` + `@Type()`
- DTO with arrays and `{ each: true }` validators
- DTO with `@IsEnum()` → enum values
- Circular reference detection
- Missing `class-validator` → clear error

### Unit Tests — ZodAdapter
- `z.object()` with various field types
- Nested `z.object()` within `z.object()`
- `z.optional()` and `z.nullable()`
- `z.array()`, `z.enum()`, `z.union()`, `z.literal()`
- Constraints (`min`, `max`, `length`)
- Missing `zod` → clear error

### Unit Tests — SchemaExtractor
- Auto-detection: DTO class → DtoAdapter
- Auto-detection: Zod schema → ZodAdapter
- Auto-detection: TypeBox schema → PassthroughAdapter
- Auto-detection: plain JSON Schema → JsonSchemaAdapter
- Unknown type → clear error
- Custom adapter registration via `registerAdapter()`

### Integration Tests
- `@ApTool` with class-validator DTO → schema extracted and registered
- `@ApTool` with Zod schema → schema extracted and registered
- `@ApTool` with TypeBox schema → passes through directly
- MCP `tools/list` returns correct JSON Schema for all adapter types

## Out of Scope (MVP)

- TypeScript type inference without decorators (impossible at runtime due to type erasure)
- class-validator groups-based conditional schemas
- Custom validator extraction
- Swagger/OpenAPI schema import
- Schema caching/memoization (add if performance is an issue)
