# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-02-27

### Added

- **`metricsCollector` option in `ApcoreMcpModuleOptions`** — Accepts a `{ exportPrometheus(): string }` instance to enable the Prometheus `/metrics` endpoint on HTTP transports, matching the upstream `ServeOptions.metricsCollector` from apcore-mcp.
- **Re-exports from `apcore-mcp`** — `reportProgress`, `elicit`, `createBridgeContext` helpers and `BridgeContext`, `OpenAIToolDef`, `ServeOptions`, `MetricsExporter` types are now re-exported from `nestjs-apcore` for convenience, so users don't need to import from `apcore-mcp` directly.
- **`metricsCollector` forwarding in `ApcoreMcpService.start()`** — The service now passes the `metricsCollector` option through to `serve()`.
- **New test**: `metricsCollector` forwarding verified in `apcore-mcp-service.test.ts`.

### Changed

- **`logLevel` type tightened** — `ApcoreMcpModuleOptions.logLevel` changed from `string` to `'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'`, matching the upstream `ServeOptions` definition.
- **Examples README updated** — Local quick start now includes prerequisite `npm install && npm run build` for the parent library. Docker section now lists MCP Explorer and REST API URLs.

### Removed

- **`endpoint` field from `ApcoreMcpModuleOptions`** — Dead code that was never forwarded to `serve()`. No upstream equivalent.

## [0.1.0] - 2026-02-26

### Added

- **Core module system** — `ApcoreModule.forRoot()` / `forRootAsync()` providing `ApcoreRegistryService` and `ApcoreExecutorService` as global NestJS services wrapping the upstream `apcore-js` Registry and Executor.
- **MCP integration** — `ApcoreMcpModule.forRoot()` / `forRootAsync()` providing `ApcoreMcpService` that wraps `serve()` and `toOpenaiTools()` from `apcore-mcp`. Supports all transport types (`stdio`, `streamable-http`, `sse`), Tool Explorer UI, and lifecycle management via `OnApplicationBootstrap` / `OnModuleDestroy`.
- **Decorator-based registration** — `@ApTool`, `@ApModule`, `@ApContext` decorators for marking NestJS service methods as apcore tools. `ApToolScannerService` auto-discovers decorated methods at module initialization and registers them as `FunctionModule` instances.
- **Programmatic registration** — `ApcoreRegistryService.registerMethod()` and `registerService()` for registering service methods without decorators.
- **YAML binding loader** — `ApBindingLoader` for registering tools from `binding.yaml` files, supporting `module_id`, `target`, schemas, annotations, and tags.
- **Schema adapters** — Pluggable schema extraction with 4 built-in adapters: TypeBox, Zod, class-validator DTO, and raw JSON Schema. `SchemaExtractor` auto-detects schema format via priority-based adapter chain.
- **ID generation utilities** — `normalizeClassName`, `normalizeMethodName`, `generateModuleId` for consistent module ID generation (e.g., `EmailService.sendBatch` -> `email.send_batch`).
- **Examples demo** — Complete NestJS application in `examples/` with `TodoModule` (CRUD + REST controller, dual-protocol) and `WeatherModule` (DI chain with `GeoService`). Includes Dockerfile, docker-compose.yml, and README.
- **Full test suite** — 358 tests across 17 test files covering all modules, services, decorators, adapters, and integration scenarios.
