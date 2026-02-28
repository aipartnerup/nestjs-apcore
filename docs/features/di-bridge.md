# NestJS DI Bridge

## Overview

Bridge between NestJS dependency injection container and apcore Registry for **zero-decorator** integration. Enables registering existing NestJS service methods as apcore modules without modifying the service source code. Complements [@ApTool Decorator](aptool-decorator-scanner.md) by providing an alternative path for legacy code or third-party services that cannot be decorated.

## Relationship to Other Features

```
Two paths to register NestJS services as apcore modules:

Path A (@ApTool Decorator): Add decorators to source code
  @ApTool() on methods → Scanner auto-registers
  Best for: new code, code you own

Path B (DI Bridge): Zero source code modification
  registerService() / YAML binding with DI → external registration
  Best for: legacy code, third-party services, gradual migration
```

@ApTool Decorator and DI Bridge are complementary. Both ultimately register modules to the same `ApcoreRegistry` ([MCP Server Integration](mcp-server-integration.md)) and output via the same MCP Server ([MCP Server Integration](mcp-server-integration.md)).

## Dependencies

- [MCP Server Integration](mcp-server-integration.md) — `ApcoreModule`, `ApcoreRegistry`
- [Schema Extraction](schema-extraction.md) — `SchemaExtractor` for auto-converting DTO/Zod schemas
- `apcore-typescript` — `FunctionModule`, `Registry`
- NestJS `ModuleRef` / `DiscoveryService` — for resolving provider instances

## Public API

### ApcoreRegistry Extensions

Extend `ApcoreRegistry` (from [MCP Server Integration](mcp-server-integration.md)) with DI-aware registration methods:

```
registerService(
  serviceClass: Type<any>,
  options: RegisterServiceOptions,
): void

registerMethod(
  serviceClass: Type<any>,
  methodName: string,
  options: RegisterMethodOptions,
): void
```

### RegisterServiceOptions

Bulk-register multiple methods from one service.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `namespace` | `string` | No | class name (normalized) | ID prefix for all methods. |
| `methods` | `string[] \| '*'` | No | `'*'` | Which methods to register. `'*'` = all public methods. |
| `exclude` | `string[]` | No | `[]` | Methods to exclude (when using `'*'`). |
| `descriptions` | `Record<string, string>` | Yes | — | Description per method. Required by apcore spec. |
| `schemas` | `Record<string, MethodSchema>` | No | `{}` | Explicit schemas per method. Omitted = auto-extract. |
| `annotations` | `ApToolAnnotations \| null` | No | `null` | Default annotations for all methods. |
| `methodAnnotations` | `Record<string, ApToolAnnotations>` | No | `{}` | Per-method annotation overrides. |
| `tags` | `string[]` | No | `[]` | Tags applied to all registered methods. |

```typescript
interface MethodSchema {
  inputSchema?: unknown;   // DTO class, Zod, TypeBox, or JSON Schema
  outputSchema?: unknown;
}
```

### RegisterMethodOptions

Register a single method.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | `string \| null` | No | `null` | Explicit module ID. `null` = auto-generate. |
| `namespace` | `string \| null` | No | class name (normalized) | ID prefix. |
| `description` | `string` | Yes | — | Tool description. |
| `inputSchema` | `unknown \| null` | No | `null` | Input schema (any supported format). `null` = auto-extract from parameter type. |
| `outputSchema` | `unknown \| null` | No | `null` | Output schema. `null` = permissive fallback. |
| `annotations` | `ApToolAnnotations \| null` | No | `null` | Module annotations. |
| `tags` | `string[]` | No | `[]` | Tags. |

## Behavior

### registerService() Flow

1. Resolve service instance from NestJS DI container via `ModuleRef.get(serviceClass, { strict: false })`
2. Determine which methods to register:
   - If `methods: '*'` → reflect on instance prototype, collect all non-constructor, non-private methods (methods not starting with `_`)
   - If `methods: ['send', 'batchSend']` → use specified list
   - Apply `exclude` filter
3. For each method:
   a. Generate module ID: `${namespace}.${kebabCase(methodName)}`
   b. Look up description from `options.descriptions[methodName]`. If missing → throw error.
   c. Resolve schema: explicit from `options.schemas[methodName]` → auto-extract via [Schema Extraction](schema-extraction.md) → permissive fallback
   d. Merge annotations: method-specific overrides class-level defaults
   e. Create execution wrapper (see Execution Bridge below)
   f. Wrap as `FunctionModule` and register to Registry
4. Log: `"DI Bridge: registered N methods from ${serviceClass.name}"`

### registerMethod() Flow

Same as above but for a single method. Convenience for one-off registrations.

### Execution Bridge

Same approach as [@ApTool Scanner](aptool-decorator-scanner.md):

```
execute(inputs, context):
  instance = DI-resolved service instance (singleton, cached at registration time)
  result = instance[methodName](inputs)
  return normalizeResult(result)
```

The service instance is resolved once during registration and cached (reference held by the closure). This matches NestJS's default singleton scope. For request-scoped providers, see Constraints below.

### DI Instance Resolution

```
ModuleRef.get(ServiceClass, { strict: false })
  ↓
Returns the singleton instance managed by NestJS DI
  ↓
Instance has all constructor dependencies already injected
  ↓
Closure captures this fully-constructed instance
```

`strict: false` allows resolving providers from any module in the app, not just the current module. This is necessary because the registration code may live in a different module than the service.

## YAML Binding with DI Support

Extend apcore-typescript's `BindingLoader` concept with DI awareness. Instead of calling `new cls()`, resolve from NestJS container.

### ApBindingLoader

```
class ApBindingLoader {
  constructor(
    private moduleRef: ModuleRef,
    private registry: ApcoreRegistry,
    private schemaExtractor: SchemaExtractor,
  )

  loadBindings(filePath: string): void
  loadBindingsFromDir(dirPath: string): void
}
```

### Binding YAML Format

```yaml
bindings:
  - module_id: email.send
    target: EmailService.send      # class.method (resolved via DI)
    description: "Send an email"
    input_schema:                   # inline JSON Schema
      type: object
      properties:
        to: { type: string }
        subject: { type: string }
        body: { type: string }
      required: [to, subject, body]

  - module_id: email.batch-send
    target: EmailService.batchSend
    description: "Send batch emails"
    input_schema_ref: ./schemas/batch-send.schema.yaml   # external file
    annotations:
      destructive: true

  - module_id: order.create
    target: OrderService.create
    description: "Create a new order"
    # No schema specified → auto-extract from OrderService.create parameter type
```

**Target resolution:**
- `EmailService.send` → `ModuleRef.get(EmailService)` → get instance → bind `instance.send`
- Service class is looked up by name from NestJS's provider registry
- If class name is ambiguous, support fully qualified: `@myapp/email:EmailService.send`

**Schema resolution (priority order):**
1. `input_schema` / `output_schema`: inline JSON Schema in YAML
2. `input_schema_ref` / `output_schema_ref`: external YAML/JSON file
3. Neither specified: auto-extract from method parameter type via [Schema Extraction](schema-extraction.md)
4. Auto-extract fails: use permissive schema with warning

## Module Registration

`ApBindingLoader` and the `registerService()`/`registerMethod()` APIs are provided by `ApcoreModule`. They are available wherever `ApcoreModule` is imported.

```typescript
@Module({
  imports: [
    ApcoreModule.forRoot({
      bindings: './bindings',  // optional: auto-load YAML bindings from directory
    }),
  ],
  providers: [EmailService, OrderService],
})
export class AppModule implements OnModuleInit {
  constructor(private registry: ApcoreRegistry) {}

  onModuleInit() {
    // Programmatic registration (alternative to YAML)
    this.registry.registerService(EmailService, {
      namespace: 'email',
      methods: ['send', 'batchSend'],
      descriptions: {
        send: 'Send an email',
        batchSend: 'Send batch emails',
      },
      methodAnnotations: {
        batchSend: { destructive: true },
      },
    });
  }
}
```

## Usage Examples

### Bulk Register All Methods

```typescript
// Register all public methods of UserService
this.registry.registerService(UserService, {
  namespace: 'user',
  methods: '*',
  exclude: ['onModuleInit', 'onModuleDestroy'],  // exclude lifecycle hooks
  descriptions: {
    create: 'Create a new user',
    update: 'Update user profile',
    delete: 'Delete a user account',
    findById: 'Find user by ID',
    search: 'Search users',
  },
  annotations: { readonly: false },
  methodAnnotations: {
    findById: { readonly: true },
    search: { readonly: true },
    delete: { destructive: true, requiresApproval: true },
  },
});
// Registers: user.create, user.update, user.delete, user.find-by-id, user.search
```

### Register Single Method

```typescript
this.registry.registerMethod(PaymentService, 'charge', {
  id: 'billing.charge-card',
  description: 'Charge a credit card',
  inputSchema: ChargeDto,           // class-validator DTO → auto-extracted
  annotations: { destructive: true, requiresApproval: true },
});
```

### Register Third-Party Service

```typescript
// A third-party NestJS package — you can't add decorators to its source
import { StripeService } from '@company/nestjs-stripe';

this.registry.registerService(StripeService, {
  namespace: 'stripe',
  methods: ['createCharge', 'refund', 'getBalance'],
  descriptions: {
    createCharge: 'Create a Stripe charge',
    refund: 'Refund a Stripe charge',
    getBalance: 'Get Stripe account balance',
  },
  schemas: {
    createCharge: {
      inputSchema: z.object({
        amount: z.number().min(1),
        currency: z.string().length(3),
        customerId: z.string(),
      }),
    },
    getBalance: {
      inputSchema: z.object({}),
    },
  },
  methodAnnotations: {
    getBalance: { readonly: true },
    refund: { destructive: true },
  },
});
```

### YAML Binding File

```yaml
# bindings/email.binding.yaml
bindings:
  - module_id: email.send
    target: EmailService.send
    description: "Send an email to a recipient"
    annotations:
      open_world: true
    tags: [communication, email]

  - module_id: email.batch-send
    target: EmailService.batchSend
    description: "Send emails to multiple recipients"
    annotations:
      destructive: true
      open_world: true
    tags: [communication, email, bulk]
```

### Auto-Load Bindings from Directory

```typescript
ApcoreModule.forRoot({
  bindings: './bindings',  // loads all *.binding.yaml files
})
```

## Constraints

- **Singleton scope only.** Services must be NestJS default scope (singleton). Request-scoped and transient-scoped providers cannot be captured at registration time. If a request-scoped provider is detected, throw: `"Cannot register request-scoped provider ${className}. Only singleton providers are supported."`
- **Service must be registered as NestJS provider.** `ModuleRef.get()` only finds providers that are part of the NestJS module tree. Unregistered classes throw: `"Cannot resolve ${className} from NestJS DI container. Ensure it is registered as a provider."`
- **Descriptions are mandatory.** apcore spec requires description for every module. `registerService()` throws if a method is missing from the `descriptions` map.
- **Method resolution:** Only own methods and prototype methods are considered. Inherited methods from base classes are included. Static methods are excluded.

## Error Handling

| Error | When | Message |
|---|---|---|
| Service not found in DI | `registerService()` or `registerMethod()` | `"Cannot resolve ${className} from NestJS DI container. Ensure it is registered as a provider."` |
| Request-scoped provider | Registration attempt | `"Cannot register request-scoped provider ${className}. Only singleton providers are supported."` |
| Missing description | `registerService()` with missing description entry | `"Missing description for ${className}.${methodName}. All methods require a description."` |
| Method not found | `registerMethod()` with non-existent method | `"Method '${methodName}' not found on ${className}."` |
| Duplicate module ID | Same ID registered twice | `"Duplicate apcore module ID '${id}'. Already registered."` |
| YAML parse error | `loadBindings()` with invalid YAML | `"Failed to parse binding file ${filePath}: ${parseError}"` |
| Target class not found | YAML binding with unknown class name | `"Cannot resolve target '${target}': class '${className}' not found in NestJS DI container."` |
| Schema extraction failure | Auto-extract fails for a method | Warning logged, permissive schema used as fallback. |

## Testing Strategy

### Unit Tests — registerService()
- Register all public methods of a test service → correct IDs and schemas
- `methods: '*'` discovers only public methods (not `_private`, not constructor)
- `methods: [...]` registers only specified methods
- `exclude` filters methods correctly
- Namespace from option vs auto-generated from class name
- Missing description → throws
- Annotation merging: method-level overrides service-level
- Tag assignment

### Unit Tests — registerMethod()
- Single method registration with explicit ID
- Single method registration with auto-generated ID
- Schema auto-extraction via Schema Extraction
- Explicit schema override (DTO, Zod, TypeBox)

### Unit Tests — ApBindingLoader
- Load YAML binding → correct modules registered
- Inline schema in YAML → converted correctly
- Schema ref to external file → loaded and converted
- No schema → auto-extract attempted
- Invalid YAML → clear error
- Unknown target class → clear error
- Multiple binding files from directory

### Integration Tests
- Full NestJS app with `registerService()` → modules appear in MCP tools/list
- MCP tools/call executes registered method with DI dependencies working
- YAML bindings loaded at startup → tools available
- Combining @ApTool Decorator and DI Bridge (registerService) in same app → both work, no conflicts
- Third-party provider registration → DI resolves correctly

### Edge Cases
- Service with no public methods + `methods: '*'` → no modules registered, warning logged
- Method returning void → normalized to `{}`
- Method throwing error → handled by apcore error pipeline
- Service registered in a lazy-loaded module → resolved correctly with `strict: false`

## Out of Scope (MVP)

- Request-scoped and transient-scoped provider support
- Auto-discovery of all providers without explicit registration (would register too many irrelevant methods)
- Binding hot-reload (watch YAML files for changes)
- Method parameter name preservation (TypeScript erases parameter names)
- Binding to static methods or standalone functions (use apcore-typescript's native `module()` for these)
