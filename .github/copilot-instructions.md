# Copilot Instructions for mongosh

## Build & Test Commands

```bash
# Bootstrap (install + compile all packages)
npm run bootstrap

# Compile all packages
npm run compile

# Compile only cli-repl and its dependencies (faster for CLI work)
npm run compile-cli

# Lint all packages
npm run lint

# Lint a single package
npm run lint --workspace @mongosh/shell-api

# Run all tests with coverage
npm test

# Run tests for a single package
npm run test --workspace @mongosh/errors

# Run a single test file (from the package directory)
cd packages/errors && npx mocha src/index.spec.ts

# Run specific tests within a file using .only()
# Change `it(...)` to `it.only(...)` or `describe.only(...)` in the test file

# Run e2e tests (requires a MongoDB instance via mongodb-runner)
npm run test-e2e

# Reformat code
npm run reformat --workspaces --if-present
```

## Architecture

This is a Lerna monorepo with npm workspaces. Packages use independent versioning.

### Layered Package Structure

```
cli-repl              ← CLI entry point (bin/mongosh.js → src/run.ts)
browser-repl          ← React-based shell for Compass (browser entry point)
├── shell-evaluator   ← Evaluates user input, manages execution context
│   ├── shell-api     ← Shell API classes (Database, Collection, Cursor, etc.)
│   │   ├── service-provider-core  ← Abstract interface for DB operations
│   │   ├── shell-bson             ← BSON type wrappers
│   │   └── errors                 ← Error hierarchy with codes
│   └── async-rewriter2            ← Babel transform for implicit await
├── service-provider-node-driver   ← MongoDB Node.js driver implementation
├── arg-parser, autocomplete, editor, history, snippet-manager  ← Utilities
└── node-runtime-worker-thread, browser-runtime-core            ← Runtime adapters
```

**Two entry points**: `cli-repl` (terminal) and `browser-repl` (MongoDB Compass). Both share the core evaluation pipeline (`shell-evaluator` → `shell-api` → `service-provider`).

### Service Provider Pattern

`service-provider-core` defines abstract interfaces (`Readable`, `Writable`, `Closable`, `Admin`) for all database operations. `service-provider-node-driver` is the concrete implementation using the MongoDB Node.js driver. Shell API classes never use the driver directly — they go through the service provider.

### Async Rewriter

`async-rewriter2` is a Babel-based transform that enables **implicit `await`** in the shell. Users type `db.test.find().toArray()` without `await`, and the rewriter detects Promise-returning methods (marked with a Symbol) and inserts awaits at runtime. It uses a two-pass compilation process.

### Shell API Decorators

Shell API classes in `packages/shell-api/src/` use decorators for metadata:

- `@shellApiClassDefault` — marks a class as a shell API type with help text
- `@returnsPromise` — marks a method as async (used by the async rewriter)
- `@returnType('TypeName')` — specifies the return type for shell display
- `@serverVersions(['min', 'max'])` — MongoDB version constraints
- `@topologies([...])` — supported topologies (standalone, replicaset, sharded)
- `@deprecated` — marks deprecated methods
- `@platforms([...])` — platform constraints
- `@apiVersions([...])` — Stable API version support

These decorators wrap methods to check interrupts (Ctrl+C), emit telemetry, transform errors, and track call depth.

### Error Handling

Errors extend `MongoshBaseError` with a code (e.g., `COMMON-10001`) and scope. Common error types: `MongoshRuntimeError`, `MongoshInvalidInputError`, `MongoshInternalError`, `MongoshUnimplementedError`. Error codes are defined in `CommonErrors` and package-specific registries.

## Key Conventions

- **TypeScript strict mode** with `nodenext` module resolution, targeting ES2021.
- **Test files** use the `.spec.ts` suffix and live alongside source files.
- **Mocha + Chai + Sinon** for testing. Each package has its own `.mocharc.json` extending the shared config in `configs/mocha-config-mongosh/`.
- **ESLint** extends `@mongodb-js/eslint-config-devtools` via the local `configs/eslint-config-mongosh/` config. **Prettier** uses `@mongodb-js/prettier-config-devtools`.
- **NYC** for coverage with a 90% line coverage requirement.
- **Integration tests** use `mongodb-runner` (via `@mongosh/testing`'s `startSharedTestServer()`) to spawn real MongoDB instances.
- **Compiled output** goes to `lib/` directories. Each package compiles with `tsc -p tsconfig.json`. The `shell-api` package also runs API Extractor after compilation.
- Workspace references use `@mongosh/` scope (e.g., `@mongosh/shell-api`, `@mongosh/errors`).
- Node.js >= 20.19.3 is required.
