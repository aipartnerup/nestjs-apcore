# nestjs-apcore Implementation Plan

## Project Overview

A NestJS adapter for the apcore ecosystem, enabling NestJS applications to expose business logic as AI-callable tools via MCP Server and OpenAI Tools.

**Package name**: `nestjs-apcore`
**Architecture**: Thin adapter layer on top of `apcore-typescript` + `apcore-mcp-typescript`

## Dependency Graph

```
T01 Project Scaffold
 └→ T02 ApcoreModule (Registry + Executor)
     └→ T03 ApcoreMcpModule (MCP Server lifecycle)
         └→ T04 MCP Transport Controllers (shared HTTP)
     └→ T05 SchemaExtractor Core + PassthroughAdapter + JsonSchemaAdapter
         └→ T06 ZodAdapter
         └→ T07 DtoAdapter (class-validator)
     └→ T08 ID Generation Utilities
         └→ T09 @ApTool + @ApModule + @ApContext Decorators
             └→ T10 ApToolScanner
         └→ T11 registerService() + registerMethod()
             └→ T12 ApBindingLoader (YAML + DI)
     └→ T13 End-to-End Integration Tests
         └→ T14 Public API + Package Exports
```

## Conventions

Following apcore ecosystem patterns:
- **Build**: `tsc` (TypeScript compiler)
- **Test**: Vitest 3.x with `@vitest/coverage-v8`, 90% min coverage
- **Module**: ESM (`"type": "module"`)
- **Target**: ES2022
- **Source**: `src/` with subdirectories, tests in `tests/`
- **Strict mode**: `strict: true` in tsconfig

---

## Tasks

### T01: Project Scaffold

**Feature**: Setup
**Priority**: Critical (blocks everything)

**Deliverables**:
- `package.json` with dependencies, peer dependencies, scripts
- `tsconfig.json` + `tsconfig.build.json`
- `vitest.config.ts`
- `.eslintrc` or `eslint.config.js`
- `src/index.ts` (empty public API)
- `tests/` directory structure

**Dependencies (npm)**:

Production:
- `@nestjs/common` (peer, `>=10.0.0`)
- `@nestjs/core` (peer, `>=10.0.0`)
- `apcore-typescript` (peer)
- `apcore-mcp-typescript` (peer)
- `reflect-metadata` (peer)
- `js-yaml` (direct, for binding loader)

Optional peers:
- `class-validator` (for DtoAdapter)
- `class-transformer` (for DtoAdapter)
- `zod` (for ZodAdapter)

Dev:
- `typescript` `^5.5.0`
- `vitest` `^3.0.0`
- `@vitest/coverage-v8` `^3.0.0`
- `@nestjs/testing`
- `@nestjs/platform-express`
- `@sinclair/typebox`
- `@types/node` `^20.0.0`
- `class-validator` + `class-transformer` (for testing DtoAdapter)
- `zod` (for testing ZodAdapter)

**Source structure**:
```
src/
├── index.ts                     # Public API exports
├── types.ts                     # Shared type definitions
├── constants.ts                 # Injection tokens, metadata keys
├── core/                        # F001: ApcoreModule
│   ├── apcore.module.ts
│   ├── apcore-registry.service.ts
│   ├── apcore-executor.service.ts
│   └── apcore-module.options.ts
├── mcp/                         # F001: ApcoreMcpModule
│   ├── apcore-mcp.module.ts
│   ├── apcore-mcp.service.ts
│   ├── apcore-mcp-module.options.ts
│   └── controllers/
│       ├── streamable-http.controller.ts
│       └── sse.controller.ts
├── schema/                      # F003: Schema Extraction
│   ├── schema-extractor.service.ts
│   ├── adapters/
│   │   ├── schema-adapter.interface.ts
│   │   ├── typebox.adapter.ts
│   │   ├── json-schema.adapter.ts
│   │   ├── zod.adapter.ts
│   │   └── dto.adapter.ts
│   └── index.ts
├── decorators/                  # F002: Decorators + Scanner
│   ├── ap-tool.decorator.ts
│   ├── ap-module.decorator.ts
│   ├── ap-context.decorator.ts
│   ├── ap-tool-scanner.service.ts
│   └── index.ts
├── bridge/                      # F004: DI Bridge
│   ├── register-service.ts
│   ├── register-method.ts
│   ├── binding-loader.ts
│   └── index.ts
└── utils/
    ├── id-generator.ts          # ID generation + normalization
    ├── name-normalizer.ts       # PascalCase → kebab-case, suffix removal
    └── result-normalizer.ts     # Normalize method return values
```

**TDD steps**:
1. Create package.json, verify `npm install` succeeds
2. Create tsconfig, verify `npx tsc --noEmit` passes
3. Create vitest config, verify `npx vitest run` passes (0 tests)
4. Write smoke test: `import {} from 'nestjs-apcore'` compiles
5. Verify `npm run build` produces `dist/`

---

### T02: ApcoreModule (Registry + Executor Providers)

**Feature**: F001
**Depends on**: T01

**Deliverables**:
- `ApcoreModule` with `forRoot()` and `forRootAsync()`
- `ApcoreRegistry` service (wraps apcore `Registry`)
- `ApcoreExecutor` service (wraps apcore `Executor`)
- Injection tokens in `constants.ts`

**TDD steps**:
1. **Test**: `ApcoreModule.forRoot()` creates a valid NestJS module
2. **Impl**: Static `forRoot()` method returns `DynamicModule`
3. **Test**: `ApcoreRegistry` is injectable after importing `ApcoreModule`
4. **Impl**: `ApcoreRegistry` provider wrapping apcore `Registry`
5. **Test**: `ApcoreExecutor` is injectable and uses the same Registry
6. **Impl**: `ApcoreExecutor` provider wrapping apcore `Executor`
7. **Test**: `forRoot({ extensionsDir })` triggers `registry.discover()`
8. **Impl**: OnModuleInit hook for discover
9. **Test**: `forRootAsync({ useFactory })` resolves config asynchronously
10. **Impl**: Async module factory pattern
11. **Test**: `ApcoreRegistry.register()` delegates to inner Registry
12. **Test**: `ApcoreRegistry.list()` returns registered module IDs
13. **Test**: `ApcoreExecutor.call()` executes a registered module

---

### T03: ApcoreMcpModule (MCP Server Lifecycle)

**Feature**: F001
**Depends on**: T02

**Deliverables**:
- `ApcoreMcpModule` with `forRoot()` and `forRootAsync()`
- `ApcoreMcpService` (start/stop/restart, injectable)
- stdio transport support

**TDD steps**:
1. **Test**: `ApcoreMcpModule` throws if `ApcoreModule` not imported
2. **Impl**: Guard check for Registry/Executor availability
3. **Test**: `ApcoreMcpModule.forRoot({ transport: 'stdio' })` creates valid module
4. **Impl**: Static `forRoot()` method
5. **Test**: `ApcoreMcpService` is injectable
6. **Impl**: Provider registration
7. **Test**: `ApcoreMcpService.start()` creates MCP Server with MCPServerFactory
8. **Impl**: Server creation using apcore-mcp-typescript internals
9. **Test**: `ApcoreMcpService.isRunning()` returns correct state
10. **Test**: `ApcoreMcpService.stop()` cleans up resources
11. **Impl**: Stop logic with transport close
12. **Test**: `ApcoreMcpService.restart()` stops then starts
13. **Test**: `ApcoreMcpService.getToolCount()` returns Registry module count
14. **Test**: Registered modules appear as MCP tools
15. **Impl**: Build tools from Registry, register handlers
16. **Test**: `forRootAsync()` works with async config
17. **Test**: `onModuleDestroy` calls stop automatically

---

### T04: MCP Transport Controllers (Shared HTTP)

**Feature**: F001
**Depends on**: T03

**Deliverables**:
- `McpStreamableHttpController` — handles POST/DELETE at `/mcp`
- `McpSseController` — handles GET at `/sse`, POST at `/messages`
- Dynamic controller registration based on transport config

**TDD steps**:
1. **Test**: streamable-http transport registers controller at configured endpoint
2. **Impl**: Dynamic controller creation in `ApcoreMcpModule`
3. **Test**: POST to `/mcp` delegates to StreamableHTTPServerTransport
4. **Impl**: Controller that passes req/res to transport
5. **Test**: DELETE to `/mcp` closes session
6. **Test**: SSE transport registers two controllers
7. **Impl**: SSE controller with GET and POST endpoints
8. **Test**: GET `/sse` returns SSE stream
9. **Test**: POST `/messages?sessionId=X` sends message to session
10. **Test**: MCP endpoints coexist with regular NestJS routes
11. **Impl**: Ensure controllers don't conflict with user-defined routes
12. **Test**: Transport config options (endpoint, sseEndpoint, messagesEndpoint) are respected
13. **Test**: stdio transport does NOT register any controllers

---

### T05: SchemaExtractor Core + Passthrough + JsonSchema Adapters

**Feature**: F003
**Depends on**: T02

**Deliverables**:
- `SchemaExtractor` service (injectable)
- `SchemaAdapter` interface
- `TypeBoxAdapter` (passthrough)
- `JsonSchemaAdapter` (JSON Schema → TypeBox)
- Auto-detection logic

**TDD steps**:
1. **Test**: `SchemaExtractor` is injectable from ApcoreModule
2. **Impl**: Provider registration in ApcoreModule
3. **Test**: `detect()` identifies TypeBox schema → `'typebox'`
4. **Impl**: Check for `Symbol.for('TypeBox.Kind')`
5. **Test**: `detect()` identifies plain JSON Schema → `'json-schema'`
6. **Impl**: Check for plain object with `type` property
7. **Test**: `detect()` returns `'unknown'` for unrecognized input
8. **Test**: `extract()` with TypeBox schema returns it as-is (deep clone)
9. **Impl**: TypeBoxAdapter passthrough
10. **Test**: `extract()` with JSON Schema converts to TypeBox TSchema
11. **Impl**: JsonSchemaAdapter using `jsonSchemaToTypeBox()`
12. **Test**: `extract()` with unknown type throws `SchemaExtractionError`
13. **Test**: `registerAdapter()` adds custom adapter
14. **Impl**: Adapter registry with priority detection

---

### T06: ZodAdapter

**Feature**: F003
**Depends on**: T05

**Deliverables**:
- `ZodAdapter` — Zod schema → JSON Schema → TypeBox

**TDD steps**:
1. **Test**: `detect()` identifies Zod schema → `'zod'`
2. **Impl**: Check for `_def` + `safeParse`
3. **Test**: `z.object({ name: z.string() })` → correct JSON Schema
4. **Impl**: Zod-to-JSON-Schema conversion
5. **Test**: `z.optional()` → removes from required
6. **Test**: `z.nullable()` → type union with null
7. **Test**: `z.array(z.string())` → array with items
8. **Test**: `z.enum([...])` → enum values
9. **Test**: Nested `z.object()` → recursive conversion
10. **Test**: Constraints (`min`, `max`) → JSON Schema constraints
11. **Test**: Missing `zod` peer dep → clear error message

---

### T07: DtoAdapter (class-validator)

**Feature**: F003
**Depends on**: T05

**Deliverables**:
- `DtoAdapter` — class-validator DTO → JSON Schema → TypeBox

**TDD steps**:
1. **Test**: `detect()` identifies class with class-validator metadata → `'dto'`
2. **Impl**: Check for class-validator metadata storage
3. **Test**: DTO with `@IsString()` → `{ type: "string" }`
4. **Impl**: Metadata traversal + type mapping
5. **Test**: DTO with `@IsNumber()`, `@IsBoolean()`, `@IsInt()` → correct types
6. **Test**: `@IsOptional()` → not in `required` array
7. **Test**: `@MinLength(n)`, `@MaxLength(n)` → JSON Schema constraints
8. **Test**: `@Min(n)`, `@Max(n)` → number constraints
9. **Test**: `@IsEmail()` → `format: "email"`
10. **Test**: `@IsEnum(E)` → enum values
11. **Test**: `@IsArray()` with `@IsString({ each: true })` → typed array
12. **Test**: Nested DTO with `@ValidateNested()` + `@Type()` → recursive
13. **Test**: Circular reference → detected with clear error
14. **Test**: Missing `class-validator` peer dep → clear error message

---

### T08: ID Generation Utilities

**Feature**: Shared (F002 + F004)
**Depends on**: T01

**Deliverables**:
- `normalizeClassName()` — PascalCase → kebab-case, suffix removal
- `normalizeMethodName()` — camelCase → kebab-case
- `generateModuleId()` — namespace + method → dot-separated ID

**TDD steps**:
1. **Test**: `EmailService` → `email` (remove Service suffix)
2. **Test**: `OrderTools` → `order` (remove Tools suffix)
3. **Test**: `UserProfileService` → `user-profile`
4. **Test**: `MyClass` → `my-class` (no suffix to remove)
5. **Impl**: Suffix removal + PascalCase → kebab-case
6. **Test**: `batchSend` → `batch-send`
7. **Test**: `checkStatus` → `check-status`
8. **Test**: `send` → `send` (no change)
9. **Test**: `_private` → `private` (strip underscore)
10. **Impl**: camelCase → kebab-case
11. **Test**: `generateModuleId('email', 'send')` → `email.send`
12. **Test**: `generateModuleId('email', 'batchSend')` → `email.batch-send`
13. **Impl**: Combine namespace + normalized method with dot separator

---

### T09: @ApTool + @ApModule + @ApContext Decorators

**Feature**: F002
**Depends on**: T08

**Deliverables**:
- `@ApTool()` method decorator
- `@ApModule()` class decorator
- `@ApContext()` parameter decorator
- Metadata key constants

**TDD steps**:
1. **Test**: `@ApTool({ description })` stores metadata on method
2. **Impl**: `Reflect.defineMetadata` with AP_TOOL_KEY
3. **Test**: `@ApTool` without description → TypeScript compile error (type enforcement)
4. **Test**: `@ApTool` stores all optional fields (id, annotations, tags, schemas)
5. **Test**: `@ApModule({ namespace })` stores metadata on class
6. **Impl**: `Reflect.defineMetadata` with AP_MODULE_KEY
7. **Test**: `@ApContext()` stores parameter index metadata
8. **Impl**: `Reflect.defineMetadata` with AP_CONTEXT_KEY
9. **Test**: Multiple `@ApTool` methods on same class → each has own metadata
10. **Test**: `@ApModule` + `@ApTool` on same class → both metadata accessible
11. **Test**: Reading metadata from undecorated class/method → returns undefined

---

### T10: ApToolScanner

**Feature**: F002
**Depends on**: T09, T05 (SchemaExtractor), T02 (ApcoreRegistry)

**Deliverables**:
- `ApToolScanner` service — discovers and registers decorated methods at startup
- `scanInstance()` for runtime dynamic registration

**TDD steps**:
1. **Test**: Scanner discovers `@ApTool` methods from providers in test module
2. **Impl**: Iterate `ModulesContainer`, check metadata
3. **Test**: Discovered tools are registered in `ApcoreRegistry`
4. **Impl**: Create FunctionModule, call registry.register()
5. **Test**: ID generated from `@ApModule` namespace + method name
6. **Test**: ID generated from class name + method name (no @ApModule)
7. **Test**: Explicit `@ApTool({ id })` overrides auto-generation
8. **Test**: Annotations merged: tool-level overrides class-level
9. **Impl**: Annotation merge logic
10. **Test**: Tags merged: union of class and tool tags
11. **Test**: Explicit inputSchema in `@ApTool` → passed through SchemaExtractor
12. **Test**: No inputSchema → infer from `design:paramtypes` metadata
13. **Test**: Schema inference fails → throw with helpful message
14. **Test**: Duplicate ID detected → throw with both locations
15. **Impl**: ID tracking map with location info
16. **Test**: Execution wrapper calls method on DI-resolved instance
17. **Test**: Execution wrapper passes `inputs` as first argument
18. **Test**: `@ApContext()` parameter receives apcore Context
19. **Test**: Method without `@ApContext()` → context omitted
20. **Test**: `scanInstance()` registers new tools at runtime
21. **Impl**: Accept raw instance, scan its prototype
22. **Test**: Log summary after scan: "N tools from M providers"
23. **Test**: Service with no `@ApTool` methods → silently ignored

---

### T11: registerService() + registerMethod()

**Feature**: F004
**Depends on**: T08, T05, T02

**Deliverables**:
- `ApcoreRegistry.registerService()` method
- `ApcoreRegistry.registerMethod()` method

**TDD steps**:
1. **Test**: `registerMethod()` registers single method with explicit ID
2. **Impl**: Resolve instance via ModuleRef, create FunctionModule
3. **Test**: `registerMethod()` with auto-generated ID
4. **Test**: `registerMethod()` with explicit schema (TypeBox) → passes through
5. **Test**: `registerMethod()` with DTO schema → extracted via SchemaExtractor
6. **Test**: `registerMethod()` with Zod schema → extracted via SchemaExtractor
7. **Test**: `registerService()` with `methods: ['send', 'batchSend']` → registers 2 modules
8. **Impl**: Iterate methods, create FunctionModule per method
9. **Test**: `registerService()` with `methods: '*'` → discovers all public methods
10. **Impl**: Prototype reflection for method discovery
11. **Test**: `methods: '*'` excludes private methods (starting with `_`), constructor
12. **Test**: `exclude: ['onModuleInit']` filters correctly
13. **Test**: Missing description for a method → throw error
14. **Test**: Annotations merged: method-level overrides service-level
15. **Test**: Tags applied to all methods
16. **Test**: Execution wrapper calls DI-resolved instance method
17. **Test**: DI dependencies (ConfigService, etc.) work in registered methods
18. **Test**: Service not found in DI → clear error message
19. **Test**: Method not found on service → clear error message
20. **Test**: Duplicate ID → clear error message

---

### T12: ApBindingLoader (YAML + DI)

**Feature**: F004
**Depends on**: T11

**Deliverables**:
- `ApBindingLoader` service
- YAML binding file loading with DI-aware target resolution
- `ApcoreModule.forRoot({ bindings })` config option

**TDD steps**:
1. **Test**: `loadBindings()` parses YAML file and registers modules
2. **Impl**: YAML parse + iterate bindings
3. **Test**: `target: 'EmailService.send'` resolves via DI container
4. **Impl**: Parse target string, resolve class via ModuleRef
5. **Test**: Inline `input_schema` in YAML → converted to TypeBox
6. **Test**: `input_schema_ref` → loads external YAML file
7. **Test**: No schema specified → permissive fallback with warning
8. **Test**: Annotations from YAML → applied to module
9. **Test**: Tags from YAML → applied to module
10. **Test**: `loadBindingsFromDir()` loads all `*.binding.yaml` files
11. **Impl**: Glob for binding files, iterate load
12. **Test**: Invalid YAML → clear error with file path
13. **Test**: Unknown target class → clear error
14. **Test**: `ApcoreModule.forRoot({ bindings: './bindings' })` auto-loads at startup
15. **Impl**: OnModuleInit hook for auto-loading

---

### T13: End-to-End Integration Tests

**Feature**: All
**Depends on**: T04, T10, T12

**Deliverables**:
- Full NestJS app integration tests covering all features together

**TDD steps**:
1. **Test**: App with `@ApTool` decorated services + MCP Server boots successfully
2. **Test**: MCP `tools/list` returns all decorated tools
3. **Test**: MCP `tools/call` executes tool and returns result
4. **Test**: DI dependencies work in tool execution
5. **Test**: `registerService()` + `@ApTool` tools coexist in same app
6. **Test**: YAML bindings + decorated services in same app
7. **Test**: Module registered after startup appears in MCP tool list
8. **Test**: Graceful shutdown closes MCP connections
9. **Test**: Streamable HTTP transport: POST `/mcp` → valid MCP response
10. **Test**: SSE transport: GET `/sse` + POST `/messages` flow
11. **Test**: Regular NestJS routes coexist with MCP endpoints
12. **Test**: Schema from class-validator DTO → correct JSON Schema in tools/list
13. **Test**: Schema from Zod → correct JSON Schema in tools/list

---

### T14: Public API + Package Exports

**Feature**: Setup
**Depends on**: T13

**Deliverables**:
- Final `src/index.ts` with all public exports
- README.md with usage examples
- package.json `exports` field

**TDD steps**:
1. **Test**: `import { ApcoreModule, ApcoreMcpModule } from 'nestjs-apcore'` works
2. **Test**: `import { ApTool, ApModule, ApContext } from 'nestjs-apcore'` works
3. **Test**: `import { ApcoreRegistry, ApcoreExecutor, ApcoreMcpService } from 'nestjs-apcore'` works
4. **Test**: `import { SchemaExtractor } from 'nestjs-apcore'` works
5. **Impl**: `src/index.ts` re-exports all public API
6. **Test**: Types are exported correctly (compile-time check)
7. **Impl**: Package `exports` field in package.json
8. Clean up any unused internal exports

---

## Implementation Order (Recommended)

### Phase 1: Foundation (F001 core)
- T01 → T02 → T03

### Phase 2: Schema + Utilities (F003 + shared utils)
- T05 → T06, T07 (parallel)
- T08 (parallel with T05)

### Phase 3: Registration Paths (F002 + F004)
- T09 → T10
- T11 → T12
- (T10 and T11 can run in parallel)

### Phase 4: Transport + Integration
- T04
- T13

### Phase 5: Polish
- T14

## Parallel Execution Opportunities

```
T01
 └→ T02
     ├→ T03 ──→ T04
     ├→ T05 ──→ T06 (parallel)
     │       └→ T07 (parallel)
     └→ T08 ──→ T09 ──→ T10
            └→ T11 ──→ T12
                         └→ T13 ──→ T14
```

After T02 completes, three parallel tracks open:
- **Track A**: T03 → T04 (MCP transports)
- **Track B**: T05 → T06/T07 (Schema adapters)
- **Track C**: T08 → T09/T11 (ID utils → decorators/DI bridge)

## Risk Notes

1. **Sharing NestJS HTTP server (T04)**: This is the highest-risk task. apcore-mcp-typescript creates its own HTTP server; sharing NestJS's requires bypassing TransportManager and using MCP SDK transport classes directly with NestJS controllers. May require refactoring apcore-mcp-typescript to expose transport internals.

2. **class-validator metadata extraction (T07)**: The `getMetadataStorage()` API is internal and may change between versions. Pin class-validator version in peer dep range.

3. **Zod v4 compatibility (T06)**: Zod v4 is relatively new. If `toJsonSchema()` is available natively, use it. Otherwise fall back to `zod-to-json-schema` package.

4. **NestJS version compatibility**: Test with NestJS 10.x and 11.x. The `ModulesContainer` and `DiscoveryService` APIs may differ.
