# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-03-15

### Changed

- **Demo** — Renamed `examples/` directory to `demo/` and switched to pnpm for Docker builds.

### Added

- **CI** — Initial GitHub Actions workflow for build, test, and pre-commit checks.

## [0.3.0] - 2026-03-15

### Changed

- **Consolidated module** — MCP server and tool scanner integration moved directly into `ApcoreModule`, simplifying setup. `ApcoreModule.forRoot()` now accepts an optional `mcp` config and automatically imports `ApcoreMcpModule` and registers `ApToolScannerService` — no need to import them separately.
- **`forRoot()` default** — `ApcoreModule.forRoot()` can now be called with no arguments for a minimal Registry + Executor setup.
- **`forRootAsync()` MCP** — Added static `mcp` option to `ApcoreModuleAsyncOptions` for defining MCP config at module-definition time.
- **README** — Updated Quick Start and API Reference to reflect the consolidated module pattern.

## [1.1.0] - 2026-03-14

### Changed

- **Package publishing** — Removed the `"private"` field from `package.json` to allow npm publishing.

## [1.0.0] - 2026-03-14

### Added

- **apcore-toolkit integration** — Adopted `apcore-toolkit`'s `ScannedModule` as the intermediate representation for all module creation paths (decorator scanner, programmatic registration, YAML binding loader). Added `scannedModuleToFunctionModule()` and `toModuleAnnotations()` shared factory utilities.
- **`asyncServe` support** — Re-exported `asyncServe` and `APCoreMCP` class from `apcore-mcp` for programmatic server management.
- **Serialisation helpers** — `ApcoreRegistryService.toScannedModule()`, `toDict()`, and `toDicts()` for converting registered modules to toolkit intermediates and snake_case dictionaries.
- **Toolkit re-exports** — `BaseScanner`, `createScannedModule`, `cloneModule`, schema extraction utilities, writers (`YAMLWriter`, `TypeScriptWriter`, `RegistryWriter`), and serialisation helpers (`moduleToDict`, `modulesToDicts`, `annotationsToDict`, `toMarkdown`, etc.) re-exported from `nestjs-apcore`.
- **New types** — `ScanOptions`, `BoundExecuteFn`, `PreflightResult`, `PreflightCheckResult`, and additional `apcore-mcp` option types (`AsyncServeOptions`, `AsyncServeApp`, `APCoreMCPOptions`, etc.).

### Changed

- **`normalizeReturnValue` → `normalizeResult`** — Replaced local `normalizeReturnValue()` helpers in `ApcoreRegistryService` and `ApBindingLoader` with `normalizeResult()` from `apcore-js`.
- **`validate()` signature** — `ApcoreExecutorService.validate()` now returns `PreflightResult` (was `ValidationResult`) and accepts optional `context` parameter.
- **Schema handling** — Module creation now uses plain JSON Schema objects (`Record<string, unknown>`) instead of TypeBox `TSchema` for input/output schemas, improving interoperability.
- **Scanner refactor** — `ApToolScannerService` refactored to produce `ScannedModule` intermediates via `apcore-toolkit` before converting to `FunctionModule`.

## [0.1.0] - 2026-03-01

Initial release.

### Added

- **Core module** — `ApcoreModule.forRoot()` / `forRootAsync()` providing `ApcoreRegistryService` and `ApcoreExecutorService` as global NestJS singletons wrapping the upstream `apcore-js` `Registry` and `Executor`.
- **MCP module** — `ApcoreMcpModule.forRoot()` / `forRootAsync()` providing `ApcoreMcpService` that wraps `serve()` and `toOpenaiTools()` from `apcore-mcp`. Supports `stdio`, `streamable-http`, and `sse` transports, Tool Explorer UI, JWT authentication, Prometheus metrics, and lifecycle management via `OnApplicationBootstrap` / `OnModuleDestroy`.
- **Decorators** — `@ApTool`, `@ApModule`, `@ApContext` for marking NestJS service methods as apcore tools. `ApToolScannerService` auto-discovers decorated methods at startup and registers them as `FunctionModule` instances.
- **Programmatic registration** — `ApcoreRegistryService.registerMethod()` and `registerService()` for registering methods without decorators.
- **YAML binding loader** — `ApBindingLoader` for registering tools from YAML files, supporting `module_id`, `target`, schemas, annotations, and tags.
- **Schema adapters** — Pluggable schema extraction with 4 built-in adapters (TypeBox at priority 100, Zod at 50, raw JSON Schema at 30, class-validator DTO at 20). `SchemaExtractor` auto-detects format via priority chain. Custom adapters supported via `SchemaExtractor.registerAdapter()`.
- **Re-exported helpers** — `reportProgress`, `elicit`, `createBridgeContext`, `JWTAuthenticator`, `getCurrentIdentity`, `identityStorage` and associated types re-exported from `nestjs-apcore` for convenience.
- **ID generation utilities** — `normalizeClassName`, `normalizeMethodName`, `generateModuleId` for consistent module ID generation (e.g. `EmailService.sendBatch` → `email.send_batch`).
- **Demo app** — Complete NestJS application in `demo/` with `TodoModule` (CRUD + REST controller, dual-protocol) and `WeatherModule` (DI chain with `GeoService`). Demonstrates optional JWT authentication via `JWT_SECRET` env var and `getCurrentIdentity()` usage inside a tool method. Includes Dockerfile, docker-compose.yml, and README with test token and cURL examples.
- **Test suite** — 358 tests across 17 test files covering all modules, services, decorators, schema adapters, YAML binding loader, ID generation utilities, and integration scenarios.
