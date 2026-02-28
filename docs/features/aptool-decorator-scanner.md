# @ApTool Decorator + Scanner

## Overview

Decorator system that marks NestJS service methods as apcore tools, plus an auto-scanner that discovers decorated methods at bootstrap, generates module IDs, and batch-registers them to the apcore Registry. Supports runtime dynamic registration via the existing `RegistryListener` infrastructure.

## Dependencies

- [MCP Server Integration](mcp-server-integration.md) — `ApcoreModule`, `ApcoreRegistry`, `ApcoreExecutor`
- `apcore-typescript` — `FunctionModule`, `Registry`
- `reflect-metadata` — decorator metadata storage

## Decorators

### @ApTool(options)

Marks a method as an apcore tool. Can be placed on any method of an `@Injectable()` provider.

**Options (`ApToolOptions`):**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `description` | `string` | Yes | — | Tool description (max 200 chars, per apcore spec). |
| `id` | `string \| null` | No | `null` | Explicit module ID. Overrides auto-generation. |
| `inputSchema` | `TSchema \| ZodType \| ClassType \| null` | No | `null` | Input schema. `null` = infer from method parameter type. |
| `outputSchema` | `TSchema \| ZodType \| ClassType \| null` | No | `null` | Output schema. `null` = infer from return type. |
| `annotations` | `ApToolAnnotations \| null` | No | `null` | apcore module annotations. |
| `tags` | `string[]` | No | `[]` | Tags for filtering and grouping. |

**ApToolAnnotations:**

| Field | Type | Default | Description |
|---|---|---|---|
| `readonly` | `boolean` | `false` | Tool only reads data, no side effects. |
| `destructive` | `boolean` | `false` | Tool performs destructive/irreversible operations. |
| `idempotent` | `boolean` | `false` | Repeated calls with same input produce same result. |
| `requiresApproval` | `boolean` | `false` | Tool should prompt user for confirmation before executing. |
| `openWorld` | `boolean` | `true` | Tool interacts with external systems beyond the app. |

### @ApModule(options)

Optional class-level decorator. Sets namespace and shared config for all `@ApTool` methods in the class.

**Options (`ApModuleOptions`):**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `namespace` | `string` | Yes | — | ID prefix for all tools in this class. |
| `description` | `string \| null` | No | `null` | Group description (metadata only, not used by apcore). |
| `tags` | `string[]` | No | `[]` | Default tags applied to all tools in this class. Can be overridden per-tool. |
| `annotations` | `ApToolAnnotations \| null` | No | `null` | Default annotations for all tools. Can be overridden per-tool. |

## ID Generation

Module ID is resolved in priority order:

1. **Explicit**: `@ApTool({ id: 'pay.charge' })` → `pay.charge`
2. **Namespace + method**: `@ApModule({ namespace: 'email' })` + method `send` → `email.send`
3. **Class name + method**: No `@ApModule`, class `OrderService`, method `create` → `order-service.create`

**Class name normalization rules:**
- Remove common suffixes: `Service`, `Provider`, `Controller`, `Handler`, `Tools`
- PascalCase → kebab-case: `UserProfile` → `user-profile`
- Examples: `EmailService` → `email`, `OrderTools` → `order`, `UserProfileService` → `user-profile`

**Method name normalization:**
- camelCase → kebab-case: `batchSend` → `batch-send`, `checkStatus` → `check-status`
- Leading underscores stripped: `_internal` → `internal`

**Separator:** dot (`.`) between namespace and method, consistent with apcore convention.

## Scanner

### ApToolScanner

Internal service that discovers and registers decorated methods.

**Scan process (runs at `OnModuleInit`):**

1. Get all providers from NestJS `ModulesContainer`
2. For each provider instance, check if any methods have `@ApTool` metadata
3. For each decorated method:
   a. Resolve module ID (see ID Generation above)
   b. Resolve input/output schema:
      - If explicitly provided in `@ApTool` options → use directly (convert Zod/DTO to JSON Schema if needed, delegates to [Schema Extraction](schema-extraction.md))
      - If `null` → attempt inference from method parameter type metadata (requires [Schema Extraction](schema-extraction.md))
      - If inference fails → throw clear error: `"Cannot infer schema for ${className}.${methodName}. Provide explicit inputSchema in @ApTool options."`
   c. Merge annotations: tool-level overrides class-level, class-level overrides defaults
   d. Merge tags: union of class-level and tool-level tags
   e. Get provider instance from NestJS DI container
   f. Create execution wrapper: `(inputs, context) => instance[methodName](inputs)`
   g. Wrap as `FunctionModule` and register to `ApcoreRegistry`

4. Log summary: `"ApToolScanner: registered N tools from M providers"`

### Duplicate ID Detection

If two `@ApTool` methods resolve to the same module ID, throw at startup:

```
Error: Duplicate apcore module ID 'email.send' detected:
  - EmailService.send (email.service.ts)
  - NotificationService.send (notification.service.ts)
Use explicit @ApTool({ id: '...' }) to resolve the conflict.
```

### Runtime Dynamic Registration

After initial scan, tools can still be added/removed at runtime:

- **Via `ApcoreRegistry.register()`**: Direct imperative registration (from [MCP Server Integration](mcp-server-integration.md)).
- **Via programmatic scanner**: `ApToolScanner.scanProvider(provider)` to scan a dynamically loaded provider.
- All changes are picked up by `RegistryListener` (from apcore-mcp-typescript) and reflected in MCP tool list automatically.

## Execution Bridge

The wrapper created by the scanner bridges apcore's `execute(inputs, context)` to the NestJS method call.

**Bridge behavior:**

```
apcore Executor calls:
  module.execute(inputs: Record<string, unknown>, context: Context)
    ↓
Wrapper calls:
  providerInstance[methodName](inputs)
    ↓
NestJS service method receives:
  async send(input: SendEmailDto): Promise<Result>
```

**Details:**
- `inputs` dict is passed as the first argument to the method
- `context` is NOT passed by default (NestJS methods don't expect it)
- If the method has a parameter decorated with `@ApContext()`, the apcore Context is injected into that parameter
- Return value is normalized to `Record<string, unknown>` (plain objects pass through, class instances are serialized)

### @ApContext() Parameter Decorator

Optional. Injects apcore execution context into a method parameter.

```typescript
@ApTool({ description: 'Send email with tracing' })
async send(
  input: SendEmailDto,
  @ApContext() ctx: Context,
): Promise<Result> {
  ctx.logger.info('Sending email', { to: input.to });
  // ...
}
```

If `@ApContext()` is not used, context is silently omitted. The method works as a normal NestJS service method callable from both apcore and regular NestJS code.

## Usage Examples

### Basic: @ApTool Only

```typescript
@Injectable()
class OrderService {
  constructor(private db: DatabaseService) {}

  @ApTool({ description: 'Create a new order' })
  async create(input: CreateOrderDto): Promise<Order> {
    return this.db.orders.create(input);
  }

  @ApTool({
    description: 'Cancel an order',
    annotations: { destructive: true },
  })
  async cancel(input: CancelOrderDto): Promise<void> {
    await this.db.orders.cancel(input.orderId);
  }

  // Not a tool — regular service method
  async findById(id: string): Promise<Order> {
    return this.db.orders.findById(id);
  }
}
// Registered as: 'order-service.create', 'order-service.cancel'
```

### With @ApModule Namespace

```typescript
@ApModule({
  namespace: 'email',
  tags: ['communication'],
  annotations: { openWorld: true },
})
@Injectable()
class EmailService {
  constructor(
    private config: ConfigService,
    private http: HttpService,
  ) {}

  @ApTool({ description: 'Send an email' })
  async send(input: SendEmailDto): Promise<SendResult> {
    // DI works normally
    const apiKey = this.config.get('EMAIL_API_KEY');
    return this.http.post(/* ... */);
  }

  @ApTool({
    description: 'Send batch emails',
    annotations: { destructive: true },  // overrides class-level
    tags: ['bulk'],                       // merged with class ['communication']
  })
  async batchSend(input: BatchSendDto): Promise<BatchResult> {
    // ...
  }
}
// Registered as: 'email.send', 'email.batch-send'
// 'email.send' tags: ['communication']
// 'email.batch-send' tags: ['communication', 'bulk']
// 'email.send' annotations: { openWorld: true, destructive: false, ... }
// 'email.batch-send' annotations: { openWorld: true, destructive: true, ... }
```

### Explicit ID Override

```typescript
@Injectable()
class PaymentService {
  @ApTool({
    id: 'billing.charge-card',
    description: 'Charge a credit card',
    annotations: { destructive: true, requiresApproval: true },
  })
  async charge(input: ChargeDto): Promise<ChargeResult> {
    // ...
  }
}
// Registered as: 'billing.charge-card' (explicit, ignores class name)
```

### Explicit Schema Override

```typescript
@Injectable()
class SearchService {
  @ApTool({
    description: 'Full-text search',
    inputSchema: Type.Object({
      query: Type.String(),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
      filters: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
    outputSchema: Type.Object({
      results: Type.Array(Type.Object({
        id: Type.String(),
        score: Type.Number(),
        content: Type.String(),
      })),
      total: Type.Number(),
    }),
  })
  async search(input: any): Promise<any> {
    // Schema is explicitly provided — no inference needed
  }
}
```

### With @ApContext

```typescript
@ApModule({ namespace: 'audit' })
@Injectable()
class AuditService {
  @ApTool({ description: 'Log an audit event', annotations: { readonly: false } })
  async log(
    input: AuditLogDto,
    @ApContext() ctx: Context,
  ): Promise<void> {
    // Access trace ID, caller identity, etc.
    const traceId = ctx.traceId;
    const caller = ctx.identity;
    // ...
  }
}
```

### Dynamic Provider Scanning

```typescript
@Injectable()
class PluginManager {
  constructor(
    private scanner: ApToolScanner,
    private moduleRef: ModuleRef,
  ) {}

  async loadPlugin(pluginClass: Type<any>) {
    const instance = await this.moduleRef.create(pluginClass);
    this.scanner.scanInstance(instance);
    // New @ApTool methods are registered immediately
    // RegistryListener notifies MCP clients automatically
  }
}
```

## Module Registration

`@ApTool` decorated providers must be registered in a NestJS module that imports `ApcoreModule`:

```typescript
@Module({
  imports: [ApcoreModule.forRoot()],
  providers: [EmailService, OrderService, PaymentService],
})
export class BusinessModule {}
```

The scanner discovers `@ApTool` methods only from providers in modules where `ApcoreModule` is available in the DI tree. Providers in completely isolated modules (no `ApcoreModule` import) are ignored.

## Error Handling

| Error | When | Behavior |
|---|---|---|
| Duplicate module ID | Startup scan | Throw with both locations listed. App fails to start. |
| Schema inference fails | Startup scan | Throw with class.method and hint to provide explicit schema. |
| Description missing | Startup scan | Throw: `"@ApTool on ${class}.${method} requires a description."` |
| Description > 200 chars | Startup scan | Throw: `"Description for ${id} exceeds 200 character limit."` |
| Method throws at runtime | Tool execution | Handled by apcore Executor error pipeline → ErrorMapper → MCP error response. |
| Provider not injectable | Startup scan | NestJS DI error surfaces naturally. No special handling needed. |

## Testing Strategy

### Unit Tests
- `@ApTool` stores correct metadata via `Reflect.getMetadata`
- `@ApModule` stores correct metadata via `Reflect.getMetadata`
- ID generation: class name normalization (suffix removal, PascalCase → kebab-case)
- ID generation: method name normalization (camelCase → kebab-case)
- ID priority: explicit > namespace + method > class + method
- Annotation merging: tool-level overrides class-level
- Tag merging: union of class and tool tags
- Duplicate ID detection throws with helpful message
- Schema inference delegation (to Schema Extraction) and fallback to error

### Integration Tests
- Full NestJS app with decorated services → all tools appear in Registry
- MCP `tools/list` returns all decorated tools with correct names and schemas
- MCP `tools/call` executes decorated method with DI dependencies working
- `@ApContext()` injects context correctly
- Method without `@ApContext()` works normally (context omitted)
- Dynamic `scanInstance()` registers new tools at runtime

### Edge Cases
- Service with zero `@ApTool` methods → silently ignored
- Abstract class with `@ApTool` → not scanned (not instantiable)
- Method returning void/undefined → normalized to `{}`
- Async and sync methods both work

## Out of Scope (MVP)

- Schema inference from method parameter types (depends on [Schema Extraction](schema-extraction.md), falls back to explicit schema or error)
- Method-level Guards/Pipes/Interceptors mapping to apcore ACL/middleware
- Hot module replacement (HMR) support for decorator changes during development
- Decorator for apcore Resources or Prompts (tools only in MVP)
