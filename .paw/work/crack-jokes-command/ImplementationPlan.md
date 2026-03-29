# db.crackJokes() Implementation Plan

## Overview
Add a `db.crackJokes(description, show_metadata)` method to the Database shell API class that collects database metadata (collection names, document counts, sample documents), constructs a prompt with a standup comedian persona, and calls an Azure OpenAI endpoint to generate a dad joke. Returns a plain string by default or a structured document with metadata when `show_metadata=true`. Each call is stateless — no conversation context leaks between invocations.

## Current State Analysis
- The Database class at `packages/shell-api/src/database.ts` has ~90 public methods, all following a consistent decorator + `_emitDatabaseApiCall` + service provider pattern (CodeResearch RQ-1)
- Metadata collection primitives exist: `_getCollectionNames()`, `getCollection()`, `estimatedDocumentCount()`, `find().limit().toArray()` (CodeResearch RQ-2)
- Shell-api has no HTTP dependencies; Node 20+ built-in `fetch` is available but needs a type declaration since `lib` is `["es2021"]` (CodeResearch RQ-3, RQ-7)
- `process.env` is used directly throughout cli-repl but not yet in shell-api (CodeResearch RQ-6)
- Next available shell-api error code is `SHAPI-10006` (CodeResearch RQ-4)
- Test infrastructure uses `stubInterface<ServiceProvider>()` from `ts-sinon` with Mocha+Chai (CodeResearch RQ-5)

## Desired End State
- `db.crackJokes("topic")` returns a joke string on any database (populated or empty)
- `db.crackJokes("topic", true)` returns `{ joke: "...", metadata: { collectionsUsed: [...], model: "..." } }`
- Missing `AZURE_OPENAI_*` env vars produce helpful setup messages (not exceptions)
- API failures produce actionable error messages (no key leakage)
- All unit tests pass with mocked `fetch` — no real API calls in tests
- Lint, typecheck, and existing tests unaffected

## What We're NOT Doing
- Non-Azure OpenAI providers (per Spec scope)
- Persistent configuration / config file support
- Joke history, caching, or follow-up conversations
- Custom system prompts or tone settings
- Streaming responses or token tracking
- Proxy support for the HTTP call (can be added later via `@mongodb-js/devtools-proxy-support`)

## Phase Status
- [ ] **Phase 1: Core Implementation** - Add `crackJokes` method with metadata collection, prompt construction, Azure OpenAI call, and error handling
- [ ] **Phase 2: Tests** - Unit tests covering happy path, both return modes, missing config, API failures, empty databases, and edge cases
- [ ] **Phase 3: Documentation** - Docs.md technical reference

## Phase Candidates
<!-- None for now -->

---

## Phase 1: Core Implementation

### Changes Required:

- **`packages/shell-api/src/error-codes.ts`**: Add `AzureOpenAIConfigMissing: 'SHAPI-10006'` to the `ShellApiErrors` enum. This code is emitted via the event bus for telemetry when env vars are missing (alongside the returned user-facing string), not thrown as an exception
- **`packages/shell-api/src/database.ts`**:
  - Add a `fetch` type declaration (minimal ambient declaration since `lib: ["es2021"]` lacks fetch types) — either inline or in a new `packages/shell-api/src/fetch-types.d.ts`
  - Add `crackJokes(description?: string, showMetadata?: boolean): Promise<string | Document>` method following the decorator pattern from existing methods:
    - Decorators: `@returnsPromise`, `@apiVersions([])`
    - Call `_emitDatabaseApiCall('crackJokes', { showMetadata })` — emit only the `showMetadata` flag for telemetry; exclude user description to avoid logging user prompts
    - **Config validation**: Read `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_MODEL` from `process.env`. Return plain-language setup message if any are missing (Pattern A from CodeResearch RQ-4)
    - **Metadata collection**: Use `_getCollectionNames()` (capped to 20), then for each collection: `estimatedDocumentCount()` via service provider, sample up to 5 docs via `find().limit(5).toArray()`, extract field names from samples. Truncate field values >1000 chars, omit Binary fields. Truncate user description to 500 chars
    - **Prompt construction**: Build Azure OpenAI Responses API request body with `developer` role (standup comedian persona constrained to dad jokes) and `user` role (metadata + description). Single-turn, no `previous_response_id`
    - **HTTP call**: `POST` to `${endpoint}/openai/deployments/${model}/responses?api-version=2025-03-01-preview` with `api-key` header. Parse response to extract joke text from `output[].content[].text`
    - **Return value**: If `showMetadata` is false/omitted, return joke string. If true, return `{ joke, metadata: { collectionsUsed, model } }`
    - **Error handling**: Catch fetch errors and non-OK responses, return actionable messages. Never include API key in error text

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `npm run compile --workspace @mongosh/shell-api`
- [ ] Lint passes: `npm run lint --workspace @mongosh/shell-api`

#### Manual Verification:
- [ ] `db.crackJokes("test")` returns a setup message when env vars are missing
- [ ] `db.crackJokes("test")` returns a joke string when env vars are configured and endpoint is reachable
- [ ] `db.crackJokes("test", true)` returns structured document with metadata
- [ ] Method appears in shell autocompletion

---

## Phase 2: Tests

### Changes Required:

- **`packages/shell-api/src/database.spec.ts`**: Add `describe('crackJokes', ...)` test suite following existing patterns:
  - **Setup**: Use `stubInterface<ServiceProvider>()` pattern from existing `beforeEach`. Stub `globalThis.fetch` with sinon for HTTP mocking
  - **Happy path (default)**: Stub fetch to return valid response JSON, verify method returns a string
  - **Happy path (show_metadata=true)**: Verify method returns `{ joke, metadata: { collectionsUsed, model } }`
  - **Missing env vars**: Unset each `AZURE_OPENAI_*` var individually, verify appropriate setup message returned
  - **API failure**: Stub fetch to reject or return non-OK status, verify actionable error string returned (no API key in message)
  - **Empty database**: Stub `listCollections` to return `[]`, verify joke still returned
  - **Empty collections**: Stub collections with 0 documents, verify joke returned
  - **Collection cap**: Stub 25+ collection names, verify only first 20 are used
  - **Large field truncation**: Include sample doc with >1000 char field, verify it's truncated in prompt
  - **Empty/missing description**: Call with `""` and with no args, verify no error
  - **Statelessness**: Verify no conversation state persisted between calls (no `previous_response_id` in request body)
  - **Teardown**: Restore `globalThis.fetch` stub in `afterEach`

### Success Criteria:

#### Automated Verification:
- [ ] All new tests pass: `npm run test --workspace @mongosh/shell-api`
- [ ] Existing tests still pass (no regressions)
- [ ] Lint passes: `npm run lint --workspace @mongosh/shell-api`

#### Manual Verification:
- [ ] Tests cover all acceptance scenarios from Spec.md (P1, P2, P3)
- [ ] Edge cases from Spec.md are covered

---

## Phase 3: Documentation

### Changes Required:
- **`.paw/work/crack-jokes-command/Docs.md`**: Technical reference covering implementation details, usage examples, environment variable setup, and verification approach (load `paw-docs-guidance` for template)
- **Project docs**: Not applicable — this is an experimental/fun feature, not a user-facing API change requiring README or CHANGELOG updates

### Success Criteria:
- [ ] Docs.md accurately describes the implementation
- [ ] Content is consistent with actual code behavior

---

## References
- Spec: `.paw/work/crack-jokes-command/Spec.md`
- Research: `.paw/work/crack-jokes-command/CodeResearch.md`
- Azure OpenAI Responses API: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses
