# MCP Server Integration

## Overview

Integrate apcore-mcp-typescript into NestJS application lifecycle, enabling NestJS apps to serve as MCP Servers. All apcore modules registered in the Registry are automatically exposed as MCP tools. MCP endpoints are mounted on the same HTTP server NestJS uses.

## Dependencies

- `apcore-typescript` (peer) — Registry, Executor
- `apcore-mcp-typescript` (peer) — MCPServerFactory, ExecutionRouter, RegistryListener, TransportManager
- `@modelcontextprotocol/sdk` (transitive via apcore-mcp-typescript)

## Modules

### ApcoreModule

Root module that provides apcore Registry and Executor as NestJS-managed singletons.

**Config (`ApcoreModuleOptions`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `extensionsDir` | `string \| null` | `null` | Path for file-system module discovery. `null` = no auto-discover. |
| `acl` | `AclOptions \| null` | `null` | ACL configuration (rules file path or inline rules). |
| `middleware` | `MiddlewareConfig[]` | `[]` | apcore middleware pipeline configuration. |

**Provided services:**
- `ApcoreRegistry` — wraps apcore `Registry`, injectable across the app
- `ApcoreExecutor` — wraps apcore `Executor`, injectable across the app

**Registration methods:**

```
ApcoreModule.forRoot(options?)       — sync config
ApcoreModule.forRootAsync(options?)  — async config (useFactory / useClass)
```

### ApcoreMcpModule

MCP Server module that consumes ApcoreModule's Registry/Executor and starts an MCP Server.

**Config (`ApcoreMcpModuleOptions`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `transport` | `'stdio' \| 'streamable-http' \| 'sse'` | `'stdio'` | Transport protocol. |
| `endpoint` | `string` | `'/mcp'` | HTTP endpoint path (streamable-http). |
| `sseEndpoint` | `string` | `'/sse'` | SSE connection endpoint (sse transport). |
| `messagesEndpoint` | `string` | `'/messages'` | SSE messages endpoint (sse transport). |
| `name` | `string` | `'apcore-mcp'` | MCP Server name. |
| `version` | `string` | package version | MCP Server version. |
| `tags` | `string[] \| null` | `null` | Filter: only expose modules with these tags. |
| `prefix` | `string \| null` | `null` | Filter: only expose modules with this ID prefix. |

**Registration methods:**

```
ApcoreMcpModule.forRoot(options?)       — sync config
ApcoreMcpModule.forRootAsync(options?)  — async config (useFactory / useClass)
```

**Provided services:**
- `ApcoreMcpService` — injectable service for programmatic control

## Public API

### ApcoreRegistry

Wraps apcore `Registry` as a NestJS injectable provider.

```
register(moduleId: string, module: unknown): void
unregister(moduleId: string): void
get(moduleId: string): unknown | null
getDefinition(moduleId: string): ModuleDescriptor | null
list(options?: { tags?: string[]; prefix?: string }): string[]
discover(): number                          // if extensionsDir configured
```

### ApcoreExecutor

Wraps apcore `Executor` as a NestJS injectable provider.

```
call(moduleId: string, inputs: Record<string, unknown>): Promise<Record<string, unknown>>
```

### ApcoreMcpService

Injectable service for MCP Server lifecycle control.

```
start(options?: ApcoreMcpModuleOptions): Promise<void>
stop(): Promise<void>
restart(options?: ApcoreMcpModuleOptions): Promise<void>
isRunning(): boolean
getToolCount(): number
```

## Behavior

### Startup Sequence

1. NestJS bootstraps `ApcoreModule`:
   - Creates `Registry` instance
   - If `extensionsDir` is set, calls `registry.discover()`
   - Creates `Executor` with the Registry
   - Provides `ApcoreRegistry` and `ApcoreExecutor` as singletons

2. NestJS bootstraps `ApcoreMcpModule`:
   - Injects `ApcoreRegistry` and `ApcoreExecutor` from `ApcoreModule`
   - Creates `MCPServerFactory`, `ExecutionRouter`
   - Creates `RegistryListener` for dynamic module changes
   - Starts the MCP Server on the configured transport

3. Transport-specific startup:
   - **stdio**: Connects MCP Server to process stdin/stdout via `StdioServerTransport`
   - **streamable-http**: Registers a NestJS Controller at `endpoint` that handles `POST` and `DELETE` requests, delegating to `StreamableHTTPServerTransport`
   - **sse**: Registers NestJS Controllers at `sseEndpoint` (GET) and `messagesEndpoint` (POST), delegating to `SSEServerTransport`

### Shared HTTP Server (streamable-http and sse)

MCP endpoints are served by **NestJS Controllers**, not a separate HTTP server. This means:
- Same port as NestJS app
- NestJS global middleware applies (CORS, helmet, etc.)
- NestJS global guards/interceptors do NOT apply to MCP routes (they bypass the standard NestJS pipeline and delegate directly to MCP SDK transport)
- Compatible with both Express and Fastify adapters

Implementation approach:
- Create internal Controllers (`McpStreamableHttpController`, `McpSseController`) dynamically at module registration time
- Controllers receive raw `Request`/`Response` objects and pass them to MCP SDK transport classes
- Body size limit enforced by apcore-mcp-typescript's transport layer

### Dynamic Module Registration

When modules are registered/unregistered on `ApcoreRegistry` at runtime:
- `RegistryListener` (from apcore-mcp-typescript) detects the event
- MCP tool list is updated automatically
- Connected clients see updated `tools/list` on next request

### Shutdown Sequence

1. NestJS `onModuleDestroy` lifecycle hook triggers
2. `ApcoreMcpService.stop()` is called
3. MCP Server connections are gracefully closed
4. Transport resources are released
5. `RegistryListener` stops monitoring

## Constraints

- `ApcoreMcpModule` requires `ApcoreModule` to be imported in the same application. Throws clear error if Registry/Executor are not available.
- Only one `ApcoreMcpModule.forRoot()` per application. Multiple MCP servers on different transports are not supported in MVP.
- stdio transport ignores HTTP-related options (`endpoint`, `sseEndpoint`, `messagesEndpoint`).
- No authentication/authorization on MCP endpoints in MVP. Security is delegated to apcore's ACL layer (configured via `ApcoreModule`).

## Error Handling

| Error | Behavior |
|---|---|
| `ApcoreModule` not imported | Throw `Error('ApcoreModule must be imported before ApcoreMcpModule')` at module init |
| Transport start fails (port in use, etc.) | Log error, throw, prevent app startup |
| Module execution error | Handled by apcore-mcp-typescript's `ErrorMapper`, returned as MCP error response |
| Client disconnects mid-execution | Transport handles cleanup, execution continues to completion |

## Usage Examples

### Minimal Setup

```typescript
import { Module } from '@nestjs/common';
import { ApcoreModule, ApcoreMcpModule } from 'nestjs-apcore';

@Module({
  imports: [
    ApcoreModule.forRoot({
      extensionsDir: './extensions',
    }),
    ApcoreMcpModule.forRoot({
      transport: 'streamable-http',
    }),
  ],
})
export class AppModule {}
```

### Manual Module Registration + MCP

```typescript
import { Module, OnModuleInit } from '@nestjs/common';
import { Type } from '@sinclair/typebox';
import { ApcoreModule, ApcoreMcpModule, ApcoreRegistry } from 'nestjs-apcore';
import { FunctionModule } from 'apcore-typescript';

@Module({
  imports: [
    ApcoreModule.forRoot(),
    ApcoreMcpModule.forRoot({ transport: 'sse' }),
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private registry: ApcoreRegistry) {}

  onModuleInit() {
    this.registry.register('greeting.hello', new FunctionModule({
      moduleId: 'greeting.hello',
      description: 'Say hello',
      inputSchema: Type.Object({ name: Type.String() }),
      outputSchema: Type.Object({ message: Type.String() }),
      execute: async (inputs) => ({
        message: `Hello, ${inputs.name}!`,
      }),
    }));
  }
}
```

### Async Configuration

```typescript
@Module({
  imports: [
    ApcoreModule.forRoot(),
    ApcoreMcpModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        transport: config.get('MCP_TRANSPORT', 'streamable-http'),
        name: config.get('MCP_SERVER_NAME', 'my-app'),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### Programmatic Control

```typescript
@Injectable()
export class AdminService {
  constructor(private mcp: ApcoreMcpService) {}

  async getStatus() {
    return {
      running: this.mcp.isRunning(),
      toolCount: this.mcp.getToolCount(),
    };
  }

  async restart(newTransport: 'streamable-http' | 'sse') {
    await this.mcp.restart({ transport: newTransport });
  }
}
```

## Testing Strategy

### Unit Tests
- `ApcoreModule` creates Registry and Executor correctly
- `ApcoreMcpModule` throws if `ApcoreModule` not imported
- `ApcoreMcpService` start/stop/restart lifecycle
- Configuration validation (invalid transport, missing fields)
- Dynamic module registration triggers tool list update

### Integration Tests
- Full NestJS app with `ApcoreModule` + `ApcoreMcpModule` boots successfully
- Registered modules appear in MCP `tools/list` response
- MCP `tools/call` executes module and returns result
- Module registered after startup appears in subsequent `tools/list`
- Graceful shutdown closes connections

### Transport Tests
- streamable-http: POST to `/mcp` endpoint returns valid MCP response
- sse: GET to `/sse` establishes SSE connection, POST to `/messages` sends message
- stdio: MCP protocol over stdin/stdout works correctly
- Shared HTTP server: MCP endpoints coexist with regular NestJS routes

## Out of Scope (MVP)

- `@ApTool` decorator and auto-scanning (see [ApTool Decorator](aptool-decorator-scanner.md))
- Schema extraction from DTOs/Zod (see [Schema Extraction](schema-extraction.md))
- Multiple MCP servers per app
- MCP endpoint authentication/authorization (beyond apcore ACL)
- OpenAI Tools output (available via `ApcoreExecutor` + `toOpenaiTools()` directly)
- WebSocket transport
