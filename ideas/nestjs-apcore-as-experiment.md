# Idea: nestjs-apcore as Experimental Ground for apcore Framework Integration

## 1. Original Idea

> Give NestJS applications AI service capabilities, based on apcore (spec), apcore-typescript (implementation), and apcore-mcp-typescript (MCP bridge).

## 2. Problem Evolution

The idea started as "build a NestJS MCP Server framework" but through analysis evolved into a deeper discovery:

**apcore has two usage scenarios:**
- **Scenario A (New Projects)**: Build from scratch with apcore standards. This path is well-supported.
- **Scenario B (Legacy Projects)**: Add AI service capabilities to existing code via `register()` / YAML bindings. This path has significant gaps when frameworks with DI are involved.

**nestjs-apcore is not about competing with MCP-Nest. It's about using NestJS as a real-world test bed to identify and fix gaps in apcore-typescript's Scenario B support.**

## 3. Competitive Landscape

### MCP-Nest (@rekog/mcp-nest)

| Aspect | Assessment |
|---|---|
| NestJS Integration | Excellent. Idiomatic decorators + DI. |
| Transport | SSE / Streamable HTTP / STDIO |
| Authorization | Guards + Roles/Scopes + OAuth 2.1 (beta) |
| Schema | Zod v4 input + output validation |
| Community | 578 stars, v1.9.4, actively maintained |
| **Middleware/Interceptor Pipeline** | **Missing at tool execution level** |
| **Observability** | **No OpenTelemetry, no metrics** |
| **Rate Limiting** | **No tool-level throttling** |

MCP-Nest has won the NestJS MCP space. Building "another MCP-Nest" is not justified.

### What apcore offers that MCP-Nest doesn't

| Capability | apcore | MCP-Nest |
|---|---|---|
| 10-step execution pipeline | Yes | No |
| ACL (pattern-matching rules engine) | Yes | Guards only |
| Middleware (onion model, before/after/onError) | Yes | No |
| Observability (tracing/metrics/logging) | Yes | No |
| Cross-language module standard | Yes | No |
| Dual output (MCP + OpenAI Tools) | Yes | MCP only |
| Module annotations (readonly, destructive, etc.) | Yes | No |

## 4. Identified Gaps in apcore-typescript

### Gap 1: Binding Loader Ignores DI (Critical)

`BindingLoader.resolveTarget()` calls `new cls()` with zero arguments. Any class that requires constructor injection (NestJS, Angular, Spring-style) will fail.

**Impact**: YAML bindings are unusable for DI-based frameworks.

**Fix direction**: Support an `instanceProvider` callback:
```typescript
const loader = new BindingLoader({
  instanceProvider: (className) => container.get(className)
});
```

### Gap 2: Schema Must Be Hand-Written (High Friction)

TypeScript erases types at runtime, so there's no `auto_schema` like Python has. Every `register()` call requires manually re-expressing types as TypeBox schemas.

**Impact**: ~10 lines of boilerplate per method, schema/DTO dual maintenance.

**Fix direction**: Support multiple schema sources (Zod, class-validator DTOs) with adapters that convert to JSON Schema.

### Gap 3: No Batch Registration (Moderate Friction)

`register()` is one-module-at-a-time. Registering N methods from a class requires N nearly-identical code blocks.

**Impact**: Scales poorly. 5 methods = 100+ lines of glue code.

**Fix direction**: `registerFromInstance(instance, options)` that scans decorated methods and batch-registers them.

## 5. What nestjs-apcore Should Be

**Not** a standalone MCP framework competing with MCP-Nest.
**Instead**: A thin NestJS adapter layer that:

1. **Bridges NestJS DI ↔ apcore Registry** — Resolves NestJS services, wraps their methods as apcore modules
2. **Auto-generates IDs** — From class name + method name
3. **Extracts schemas** — From NestJS DTOs (class-validator) or Zod to JSON Schema
4. **Manages lifecycle** — Registry/Executor lifecycle tied to NestJS app lifecycle
5. **Outputs via apcore-mcp-typescript** — MCP Server + OpenAI Tools, not reinvented

### Developer Experience Target

```typescript
// What a NestJS developer writes:
@ApModule({ namespace: 'email' })
@Injectable()
class EmailService {
  constructor(private config: ConfigService) {}

  @ApTool({ description: 'Send an email' })
  async send(input: SendEmailDto): Promise<SendResult> {
    // normal business logic, DI works
  }
}

// What happens automatically:
// 1. NestJS DI resolves EmailService with all dependencies
// 2. @ApTool scans → finds send() method
// 3. ID generated: 'email.send'
// 4. Schema extracted from SendEmailDto → JSON Schema
// 5. execute() wrapper created: (inputs, ctx) => emailService.send(inputs)
// 6. Registered to apcore Registry
// 7. Available as MCP tool + OpenAI tool via apcore-mcp-typescript
```

## 6. Feedback Loop to apcore-typescript

As nestjs-apcore is built, it will identify what apcore-typescript core needs:

| Discovery from nestjs-apcore | Feeds back to apcore-typescript |
|---|---|
| Need instance provider for bindings | Enhance BindingLoader API |
| Need Zod/class-validator schema support | Add schema adapter system |
| Need batch register from instance | Add registerFromInstance() |
| NestJS Guards ↔ ACL mapping patterns | Document framework capability mapping |
| NestJS Interceptors ↔ Middleware mapping | Document or provide mapping utilities |

## 7. Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Depend on apcore-typescript? | Yes | Reuse Executor, Registry, ACL, Middleware, Observability |
| Depend on apcore-mcp-typescript? | Yes | Reuse MCP Server + OpenAI Tools output |
| Reimplement transport layer? | No | apcore-mcp-typescript handles this |
| Reimplement execution pipeline? | No | apcore-typescript's 10-step pipeline is the value |
| Compete with MCP-Nest? | No | Different positioning (apcore ecosystem vs standalone MCP) |

## 8. "What If We Don't Build This?" Analysis

**If we don't build nestjs-apcore:**
- apcore Scenario B gaps remain undiscovered/unfixed
- NestJS developers must write 20+ lines of boilerplate per method to use apcore
- The same gaps will surface when building django-apcore, express-apcore, etc.
- apcore stays a "new project only" framework, limiting adoption

**If we build it:**
- Real-world test for Scenario B drives concrete improvements to apcore-typescript
- Improvements benefit ALL future framework adapters (Django, Express, FastAPI)
- NestJS developers get a genuine alternative positioning to MCP-Nest (with execution pipeline, ACL, observability)

## 9. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Over-engineering the adapter | Medium | Start minimal: DI bridge + decorator + MCP output only |
| apcore-typescript needs too many changes | Low | Changes are additive (new APIs), not breaking |
| MCP-Nest is already good enough | Medium | Positioning is different; apcore value is in pipeline/ACL/observability |
| Schema extraction from NestJS DTOs is hard | Medium | Start with manual schemas, add DTO extraction incrementally |

## 10. Recommended Next Steps

1. **Write a feature spec** (`/spec-forge feature`) for nestjs-apcore MVP
2. **MVP scope**: @ApModule + @ApTool decorators, NestJS DI bridge, auto ID generation, manual schema (TypeBox), MCP output via apcore-mcp-typescript
3. **Iterate**: Add schema extraction (Zod → JSON Schema, then class-validator → JSON Schema)
4. **Feed back**: Track what apcore-typescript changes are needed, propose them as PRs/issues

---

## Appendix: Full Ecosystem Map

```
apcore (spec)
├── apcore-typescript (v0.1.2) ─── Core: Executor, Registry, Schema, ACL, Middleware, Observability
├── apcore-python (v0.2.2) ─────── Python implementation
├── apcore-mcp-typescript (v0.1.1) ─ MCP Server + OpenAI Tools bridge
├── apcore-mcp-python ────────────── Python MCP bridge
├── nestjs-apcore (NEW) ──────────── NestJS adapter (experimental)
├── django-apcore (exploring) ────── Django adapter
├── express-apcore (empty) ────────── Express adapter
└── apflow ────────────────────────── Workflow engine
```
