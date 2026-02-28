# Feature Overview

## Features

| Feature | Document | Description |
|---|---|---|
| MCP Server Integration | [mcp-server-integration.md](mcp-server-integration.md) | Integrate apcore-mcp-typescript into NestJS lifecycle, expose Registry modules as MCP tools |
| @ApTool Decorator + Scanner | [aptool-decorator-scanner.md](aptool-decorator-scanner.md) | Decorator system for marking NestJS service methods as apcore tools with auto-scanning |
| Schema Extraction | [schema-extraction.md](schema-extraction.md) | Adapter system to extract JSON Schema from class-validator DTOs, Zod, and TypeBox |
| NestJS DI Bridge | [di-bridge.md](di-bridge.md) | Zero-decorator integration via `registerService()` and YAML bindings |

## Implementation Order

Priority from high to low. Features higher in the list should be implemented first.

1. **MCP Server Integration** — Foundation. All other features depend on `ApcoreModule`, `ApcoreRegistry`, `ApcoreExecutor`.
2. **Schema Extraction** — Required by both @ApTool Scanner and DI Bridge for schema conversion.
3. **@ApTool Decorator + Scanner** — Decorator-based registration path. Depends on MCP Server Integration and Schema Extraction.
4. **NestJS DI Bridge** — Zero-decorator registration path. Depends on MCP Server Integration and Schema Extraction. Complements @ApTool Decorator.

## Dependency Graph

```
mcp-server-integration
        │
        ├──────────────────┐
        ▼                  ▼
schema-extraction    (direct dep)
        │                  │
        ├──────┐           │
        ▼      ▼           │
aptool-decorator   di-bridge
  -scanner
```

Both `aptool-decorator-scanner` and `di-bridge` depend on `mcp-server-integration` and `schema-extraction`. They are independent of each other and can be implemented in parallel after their dependencies are ready.
