# Code Research: db.crackJokes() Command

**Branch**: users/andrewkhoma/sih2026 | **Created**: 2026-03-29

---

## RQ-1: How to Add a New Method to the Database Class

### Class Location

The `Database` class is defined at:
- **`packages/shell-api/src/database.ts:88`** — class declaration
- Decorated with `@shellApiClassDefault` at line 87
- Extends `ShellApiWithMongoClass`
- The class ends at line 1871; new methods go before the closing `}`

### Decorator Pattern

Every public async method uses this decorator stack (minimum):

```typescript
@returnsPromise
@apiVersions([1])
async methodName(...): Promise<ReturnType> { ... }
```

Some methods add topology or server-version constraints:

| Decorator | Purpose | Example |
|-----------|---------|---------|
| `@returnsPromise` | Marks method for implicit await by async rewriter | Every async method |
| `@apiVersions([1])` | Stable API version support | `database.ts:378` on `getCollectionNames` |
| `@apiVersions([])` | Not part of stable API (passes `[0,0]`) | `database.ts:1314` on `stats` |
| `@serverVersions([min, max])` | MongoDB server version range | `database.ts:393` on `getCollectionInfos` |
| `@topologies([...])` | Limits to specific topologies | `database.ts:1574` on `printShardingStatus` |
| `@returnType('TypeName')` | Declares return type for autocompletion | `database.ts:476` on `aggregate` |
| `@deprecated` | Marks deprecated methods | imported at `database.ts:11` |

**Concrete examples from database.ts:**

`getCollectionNames` — minimal decorators (`database.ts:377-381`):
```typescript
@returnsPromise
@apiVersions([1])
async getCollectionNames(): Promise<StringKey<D>[]> {
```

`getCollectionInfos` — with server version (`database.ts:392-400`):
```typescript
@returnsPromise
@serverVersions(['3.0.0', ServerVersions.latest])
@apiVersions([1])
async getCollectionInfos(filter: Document = {}, options: ListCollectionsOptions & Abortable = {}): Promise<Document[]> {
```

`hello` — with server version (`database.ts:1273-1276`):
```typescript
@returnsPromise
@apiVersions([1])
@serverVersions(['5.0.0', ServerVersions.latest])
async hello(): Promise<Document> {
```

`printShardingStatus` — with topology constraint (`database.ts:1573-1576`):
```typescript
@returnsPromise
@topologies(['Sharded'])
@apiVersions([1])
async printShardingStatus(verbose = false): Promise<CommandResult> {
```

### Required Imports

From `database.ts:4-13`:
```typescript
import {
  returnsPromise,
  returnType,
  serverVersions,
  apiVersions,
  shellApiClassDefault,
  topologies,
  deprecated,
  ShellApiWithMongoClass,
} from './decorators';
```

From `database.ts:46-53` (errors):
```typescript
import {
  CommonErrors,
  MongoshDeprecatedError,
  MongoshInvalidInputError,
  MongoshRuntimeError,
  MongoshUnimplementedError,
  MongoshInternalError,
} from '@mongosh/errors';
```

### Method Signature Pattern

All database command methods are **async** returning `Promise<T>`. Common return types:
- `Promise<Document>` — raw command results (`database.ts:412`)
- `Promise<Document[]>` — list results (`database.ts:398`)
- `Promise<string>` or `Promise<StringKey<D>[]>` — name lists (`database.ts:379`)
- `Promise<CommandResult>` — formatted output (`database.ts:1576`)

### `_emitDatabaseApiCall`

Defined at `database.ts:169-179`:
```typescript
private _emitDatabaseApiCall(
  methodName: string,
  methodArguments: Document = {}
): void {
  this._mongo._instanceState.emitApiCallWithArgs({
    method: methodName,
    class: 'Database',
    db: this._name,
    arguments: methodArguments,
  });
}
```
Emits a telemetry event recording the method name, class, database name, and arguments. Called at the start of every public method.

### Recommendation for `crackJokes`

```typescript
@returnsPromise
@apiVersions([])   // Not part of stable API
async crackJokes(description?: string, showMetadata?: boolean): Promise<string | Document> {
  this._emitDatabaseApiCall('crackJokes', { description: description ?? '' });
  // ...
}
```

---

## RQ-2: How to Collect Database Metadata

### `getCollectionNames()` Call Chain

1. Public method at `database.ts:377-382` calls `this._getCollectionNames()`
2. `_getCollectionNames()` at `database.ts:281-292` calls `this._listCollections({}, { nameOnly: true })`
3. `_listCollections()` at `database.ts:268-279` calls `this._mongo._serviceProvider.listCollections(this._name, filter, options)`
4. Returns `string[]` of collection names

### `getCollectionInfos()` Implementation

At `database.ts:392-401`:
```typescript
async getCollectionInfos(filter: Document = {}, options: ListCollectionsOptions & Abortable = {}): Promise<Document[]> {
  this._emitDatabaseApiCall('getCollectionInfos', { filter, options });
  return await this._listCollections(filter, options);
}
```
Returns array of documents: `[{ name: string, type: string, options: Document, ... }]`

### Document Count

**`countDocuments()`** — exact count, at `collection.ts:342-356`:
```typescript
async countDocuments(query?, options?): Promise<number> {
  return this._mongo._serviceProvider.countDocuments(this._database._name, this._name, query, options);
}
```

**`estimatedDocumentCount()`** — fast estimate, at `collection.ts:473-485`:
```typescript
async estimatedDocumentCount(options?): Promise<number> {
  return this._mongo._serviceProvider.estimatedDocumentCount(this._database._name, this._name, options);
}
```

For the joke command, `estimatedDocumentCount()` is preferred — faster and sufficient for metadata.

### Sampling Documents

**`find()` method** at `collection.ts:498-547`:
```typescript
@returnType('Cursor')
@apiVersions([1])
@returnsPromise
async find(query?, projection?, options?): Promise<Cursor> { ... }
```
Usage: `await collection.find({}).limit(5).toArray()` returns up to 5 documents.

**`_getSampleDocs()` internal** at `collection.ts:2640-2648`:
```typescript
async _getSampleDocs(): Promise<Document[]> {
  this._cachedSampleDocs = await (
    await this.aggregate([{ $sample: { size: 10 } }], {
      allowDiskUse: true, maxTimeMS: 1000, readPreference: 'secondaryPreferred',
    })
  ).toArray();
  return this._cachedSampleDocs;
}
```
Uses `$sample` aggregation stage. Could use this pattern for getting sample docs.

### Schema/Field Inference

No dedicated schema utility exists in the public API. The approach is to sample documents and extract `Object.keys()`. The internal `_getSampleDocs()` at `collection.ts:2640` demonstrates the pattern. The `mongodb-schema` package (`shell-api/package.json:59`) is a dependency but is used for autocompletion, not exposed as a user API.

**Recommended approach for crackJokes:** Sample 5 docs per collection, extract keys as field names.

### Getting a Collection Object from Database

`getCollection()` at `database.ts:547-572`:
```typescript
@returnType('Collection')
getCollection<K extends StringKey<D>>(coll: K): CollectionWithSchema<M, D, D[K], K> {
  // validates name, returns cached or new Collection instance
}
```

### ServiceProvider Access

`this._mongo._serviceProvider` is a getter at `packages/shell-api/src/mongo.ts:173-180`:
```typescript
get _serviceProvider(): ServiceProvider {
  if (this.__serviceProvider === null) {
    throw new MongoshInternalError('No ServiceProvider available for this mongo', ShellApiErrors.NotConnected);
  }
  return this.__serviceProvider;
}
```

The `ServiceProvider` interface at `packages/service-provider-core/src/service-provider.ts` extends `Readable`, `Writable`, `Closable`, `Admin` — exposing methods like `find()`, `countDocuments()`, `estimatedDocumentCount()`, `listCollections()`, `aggregate()`.

### Recommended Metadata Collection Pattern

```typescript
// 1. Get collection names (cap at 20)
const allNames = await this._getCollectionNames();
const names = allNames.slice(0, 20);

// 2. For each collection, gather metadata
for (const name of names) {
  const coll = this.getCollection(name);
  const count = await coll.estimatedDocumentCount();
  const sampleCursor = await coll.find({}, {}, {});
  // sampleCursor is a Cursor; need .limit(5).toArray()
  const samples = await (await coll.find()).limit(5).toArray();
  const fields = samples.length > 0 ? Object.keys(samples[0]) : [];
}
```

---

## RQ-3: How to Make HTTP Requests from Shell-API

### Shell-API Has No HTTP Capability

- `packages/shell-api/package.json:52-59` — no HTTP libraries in dependencies
- No imports of `fetch`, `axios`, `request`, or similar in any `packages/shell-api/src/` file
- Shell-api is designed as a pure MongoDB interaction layer

### CLI-REPL fetch Pattern

`packages/cli-repl/src/update-notification-manager.ts:9`:
```typescript
import { createFetch } from '@mongodb-js/devtools-proxy-support';
```

Constructor at `update-notification-manager.ts:46-52`:
```typescript
constructor({ proxyOptions = {} } = {}) {
  this.fetch = createFetch(proxyOptions);
}
```

Usage at `update-notification-manager.ts:144-167`:
```typescript
const response = await this.fetch(updateURL, { headers: { ... } });
if (!response.ok || !response.body) {
  throw new Error(`Unexpected status code...`);
}
const jsonContents = await response.json();
```

The fetch signature: `(url: string, init: RequestInit) => Promise<Response>` (`update-notification-manager.ts:44`).

### `@mongodb-js/devtools-proxy-support` Availability

- Available in `packages/cli-repl/package.json:64` — `"@mongodb-js/devtools-proxy-support": "^0.7.5"`
- Also used in `packages/snippet-manager/package.json`
- `createFetch(proxyOptions)` returns a fetch-compatible function with proxy support

### Node.js Built-in Fetch

- mongosh targets Node.js `>=20.19.3` (root `package.json`)
- Node 18+ has global `fetch` built in
- However, the codebase consistently uses `createFetch` from `devtools-proxy-support` rather than global `fetch` for proxy support
- No existing usage of `globalThis.fetch` found in the codebase

### No HTTP Pass-through from CLI-REPL to Shell-API

`ShellInstanceState` constructor (`packages/shell-api/src/shell-instance-state.ts`) accepts:
- `serviceProvider: ServiceProvider`
- `bus: MongoshBus`  
- `shellCliOptions?: ShellCliOptions`

**No proxy/fetch parameter is passed.** To use HTTP in shell-api, we'd need to either:
1. **Add a fetch function to `ShellInstanceState`** — pass from cli-repl
2. **Use Node.js built-in `fetch` directly** — simplest for a new feature, no proxy support
3. **Add `@mongodb-js/devtools-proxy-support` as a shell-api dependency** — for proxy support

### Recommendation

Use Node.js built-in `globalThis.fetch` (available in Node 20+) directly in `database.ts`. This avoids dependency changes and is the simplest approach. The Azure OpenAI endpoint is user-configured, so proxy support is a nice-to-have, not a blocker for v1.

If proxy support is needed later, `@mongodb-js/devtools-proxy-support` can be added to shell-api's dependencies following the pattern from `update-notification-manager.ts`.

### Azure OpenAI Message Structure

Per the [Azure OpenAI Responses API](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses), the request body uses an `input` array of message objects with roles. The spec requires a comedian persona set via a `developer` role message, with the user's request in a `user` role message:

```json
{
  "model": "<AZURE_OPENAI_MODEL>",
  "input": [
    {"role": "developer", "content": "You are a pro standup comedian. ...constraints about dad jokes..."},
    {"role": "user", "content": "<collected metadata + user description>"}
  ]
}
```

This is a single-turn, stateless request — no `previous_response_id` or conversation threading. Each call gets an independent response.

---

## RQ-4: Error Handling Patterns

### Error Codes in `error-codes.ts`

`packages/shell-api/src/error-codes.ts:16-53`:

| Code | Constant | Line |
|------|----------|------|
| `SHAPI-10001` | `NotConnectedToShardedCluster` | 23 |
| `SHAPI-10002` | `NotConnectedToReplicaSet` | 30 |
| `SHAPI-10003` | `NotConnectedToMongos` | 37 |
| `SHAPI-10004` | `NotConnected` | 44 |
| `SHAPI-10005` | `NotUsingFLE` | 52 |

**Next available code: `SHAPI-10006`**

Format: `SHAPI-1000X` (prefix `SHAPI` + 5-digit number).

### CommonErrors Enum

`packages/errors/src/common-errors.ts:4-47`:

| Code | Constant | Line |
|------|----------|------|
| `COMMON-10001` | `InvalidArgument` | 10 |
| `COMMON-10002` | `InvalidOperation` | 17 |
| `COMMON-10003` | `Deprecated` | 25 |
| `COMMON-10004` | `CommandFailed` | 32 |
| `COMMON-90001` | `UnexpectedInternalError` | 39 |
| `COMMON-90002` | `NotImplemented` | 46 |

### Error Class Definitions

`packages/errors/src/index.ts`:

- **`MongoshBaseError`** (`index.ts:17-29`) — abstract base, constructor: `(name, message, code?, metadata?)`
- **`MongoshRuntimeError`** (`index.ts:31-35`) — constructor: `(message, code?, metadata?)`
- **`MongoshInvalidInputError`** (`index.ts:54-58`) — constructor: `(message, code?, metadata?)`
- **`MongoshInternalError`** (`index.ts:37-46`) — always uses `CommonErrors.UnexpectedInternalError`

### Error Handling Patterns in database.ts

**Pattern A: Return error instead of throwing** (`database.ts:352-360`):
```typescript
try {
  return await this._mongo._serviceProvider.runCommand(...);
} catch (e: any) {
  return e;   // Returns error as a value
}
```

**Pattern B: Catch, modify, re-throw** (`database.ts:421-432`):
```typescript
try {
  return await this._runCommand(cmd, options);
} catch (error: any) {
  if (error.codeName === 'NotPrimaryNoSecondaryOk') {
    (error as Error).message = `not primary - consider passing readPreference...`;
  }
  throw error;
}
```

**Pattern C: Catch, fallback to alternate command** (`database.ts:1278-1290`):
```typescript
try {
  this._cachedHello = await this._runReadCommand({ hello: 1 });
  return this._cachedHello;
} catch (err: any) {
  if (err?.codeName === 'CommandNotFound') {
    const result = await this.isMaster();
    // ...fallback
  }
  throw err;
}
```

**Pattern D: Throw MongoshRuntimeError** (e.g. `database.ts:1234`):
```typescript
throw new MongoshRuntimeError('Error running command serverBuildInfo...', CommonErrors.CommandFailed);
```

**Pattern E: Throw MongoshInvalidInputError** (e.g. `database.ts:554-557`):
```typescript
if (!isValidCollectionName(coll)) {
  throw new MongoshInvalidInputError(
    `Invalid collection name: ${coll}`,
    CommonErrors.InvalidArgument
  );
}
```

### Recommendation for `crackJokes`

Per the spec (FR-009, FR-010), errors should be **returned as strings, not thrown**. This matches Pattern A. For missing env vars:
```typescript
if (!process.env.AZURE_OPENAI_ENDPOINT) {
  return 'Missing AZURE_OPENAI_ENDPOINT environment variable. Set it to your Azure OpenAI endpoint URL.';
}
```

For API failures, catch and return a friendly string:
```typescript
try {
  const response = await fetch(url, options);
  // ...
} catch (err: any) {
  return `Failed to call Azure OpenAI: ${err.message}. Check your endpoint and network connection.`;
}
```

We should still add a new error code `SHAPI-10006` (e.g., `AzureOpenAIConfigMissing`) for telemetry even though we return strings to users.

---

## RQ-5: Testing Patterns

### Test File Location

**`packages/shell-api/src/database.spec.ts`** — main unit tests for Database class.

Structure:
- Line 39: `describe('Database', function () {`
- Line 44: `describe('help', ...)`
- Line 59: `describe('collections', ...)`
- Line 98: `describe('signatures', ...)`
- Line 119: `describe('Metadata', ...)`
- Line 138: `describe('commands', ...)` — main test suite with `beforeEach` mock setup

### Test Framework

**Mocha** — `packages/shell-api/package.json:33`: `"test": "mocha"`

### Service Provider Mocking

`database.spec.ts:1-6` (imports):
```typescript
import * as chai from 'chai';
import { expect } from 'chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';
import type { StubbedInstance } from 'ts-sinon';
import { stubInterface } from 'ts-sinon';
```

`database.spec.ts:37`: `chai.use(sinonChai);`

`database.spec.ts:145-162` (mock setup):
```typescript
beforeEach(function () {
  bus = stubInterface<EventEmitter>();
  serviceProvider = stubInterface<ServiceProvider>();
  serviceProvider.initialDb = 'test';
  serviceProvider.bsonLibrary = bson;
  serviceProvider.runCommand.resolves({ ok: 1 });
  serviceProvider.runCommandWithCheck.resolves({ ok: 1 });
  instanceState = new ShellInstanceState(serviceProvider, bus);
  mongo = new Mongo(instanceState, undefined, undefined, undefined, serviceProvider);
  database = new Database(mongo, 'db1');
});
```

### Complete Test Example

`database.spec.ts:163-181`:
```typescript
describe('getCollectionInfos', function () {
  it('returns the result of serviceProvider.listCollections', async function () {
    const filter = { name: 'abc' };
    const options = { nameOnly: true };
    const result = [{ name: 'coll1' }];
    serviceProvider.listCollections.resolves(result);

    expect(await database.getCollectionInfos(filter, options)).to.deep.equal(result);
    expect(serviceProvider.listCollections).to.have.been.calledOnceWith('db1', filter, options);
  });
});
```

### HTTP Mocking in Tests

`packages/shell-api/src/field-level-encryption.spec.ts:30-36`:
```typescript
import {
  startSharedTestServer,
  makeFakeHTTPConnection,
  fakeAWSHandlers,
} from '@mongosh/testing';
```

For the `crackJokes` tests, since we'll use `globalThis.fetch`, we can mock it with sinon:
```typescript
const fetchStub = sinon.stub(globalThis, 'fetch');
fetchStub.resolves(new Response(JSON.stringify({ output: [{ content: [{ text: 'joke' }] }] })));
// ... test ...
fetchStub.restore();
```

### Test Helpers

`packages/shell-api/test/helpers.ts`:
- Line 5: `delay` — promisified setTimeout
- Lines 7-21: `ensureMaster()` — waits for primary with retries
- Lines 31-47: `ensureSessionExists()` — waits for session creation
- Lines 49-69: `ensureResult()` — generic retry/polling helper

---

## RQ-6: Environment Variable Access

### Direct `process.env` Access

The codebase uses `process.env` directly with **no abstraction layer**. Examples:

| File | Line | Variable |
|------|------|----------|
| `cli-repl/src/cli-repl.ts` | 221 | `process.env.MONGOSH_FORCE_TERMINAL` |
| `cli-repl/src/cli-repl.ts` | 257 | `process.env.MONGOSH_FORCE_DISABLE_TELEMETRY_FOR_TESTING` |
| `cli-repl/src/cli-repl.ts` | 677 | `process.env.MONGOSH_ANALYTICS_SAMPLE` |
| `cli-repl/src/cli-repl.ts` | 1010 | `process.env.MONGOSH_SKIP_NODE_VERSION_CHECK` |
| `cli-repl/src/cli-repl.ts` | 1289 | `process.env.EDITOR` |
| `cli-repl/src/cli-repl.ts` | 1336 | `process.env.MONGOSH_OIDC_PARENT_HANDLE` |
| `cli-repl/src/run.ts` | 146 | `process.env.MONGOSH_SMOKE_TEST_SERVER` |
| `cli-repl/src/config-directory.ts` | 156 | `process.env.APPDATA` |

### Patterns

**Boolean flag check:** `!!process.env.MONGOSH_FORCE_DISABLE_TELEMETRY_FOR_TESTING` (`cli-repl.ts:257`)

**String value with conditional:** `process.env.USE_NEW_AUTOCOMPLETE !== '0'` (`mongosh-repl.ts:458`)

**Optional with fallback:** `process.env.LOCALAPPDATA ?? process.env.APPDATA` (`config-directory.ts:157`)

**Direct assignment:** `if (process.env.MONGOSH_OIDC_PARENT_HANDLE) { driverOptions.parentHandle ??= process.env.MONGOSH_OIDC_PARENT_HANDLE; }` (`cli-repl.ts:1336-1337`)

### No Shell-API `process.env` Usage

`packages/shell-api/src/` has **no `process.env` usage** outside test files. The `crackJokes` command would be the first shell-api method to read environment variables directly.

### Recommendation

Use `process.env` directly — this matches the established codebase pattern. Read the three required variables at call time:
```typescript
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const model = process.env.AZURE_OPENAI_MODEL;
```

---

## RQ-7: TypeScript and Build Considerations

### tsconfig

**`packages/shell-api/tsconfig.json`** extends `configs/tsconfig-mongosh/tsconfig.common.json`:

Key settings from the shared config (`configs/tsconfig-mongosh/tsconfig.common.json`):
- Line 16: `"target": "es2021"`
- Line 17: `"lib": ["es2021"]` — **no DOM, no fetch types**
- Line 18: `"module": "nodenext"`
- Line 19: `"moduleResolution": "nodenext"`
- Line 8: `"strict": true`
- Line 14: `"declaration": true`

Shell-api specific overrides:
- `"outDir": "./lib"` (line 4)
- Includes `src/**/*`, excludes `src/**/*.spec.*`

### Fetch Type Declarations

Since `lib` is only `["es2021"]` and there's no `@types/node` with fetch types in shell-api's devDependencies (`package.json:61-76`), using `globalThis.fetch` directly would cause a TypeScript error.

**Options to resolve:**
1. **Declare `fetch` locally** — add a minimal type declaration in the file or a `.d.ts` file
2. **Add `"lib": ["es2022"]`** or add a types reference to Node.js fetch types
3. **Use dynamic `globalThis['fetch']` with type assertion** — avoids type issues

Simplest approach: add a local type declaration at the top of `database.ts` or in a new `fetch.d.ts`:
```typescript
declare const fetch: (url: string, init?: RequestInit) => Promise<Response>;
```

Or cast: `const fetchFn = globalThis.fetch as (url: string, init?: any) => Promise<any>;`

### Shell-API Dependencies

`packages/shell-api/package.json:52-59`:
```
@mongosh/arg-parser, @mongosh/errors, @mongosh/i18n,
@mongosh/service-provider-core, @mongosh/shell-bson,
mongodb-redact, mongodb-schema
```

**No HTTP libraries.** Using built-in `fetch` avoids adding new dependencies.

### Build Command

`packages/shell-api/package.json:25`:
```
"compile": "tsc -p tsconfig.json && npm run api-generate"
```

Runs TypeScript compiler then API Extractor for documentation generation.

### Impact Assessment

Adding `crackJokes` to `database.ts` requires:
1. **No new dependencies** if using built-in `fetch`
2. **A type declaration** for `fetch` (since `lib` lacks DOM/Node fetch types)
3. **No tsconfig changes** needed
4. **API Extractor** will automatically pick up the new method for documentation

---

## Summary: Implementation Checklist

| Step | File(s) | Notes |
|------|---------|-------|
| Add `crackJokes` method | `packages/shell-api/src/database.ts:1870` (before closing `}`) | Use `@returnsPromise` + `@apiVersions([])` decorators |
| Add error code | `packages/shell-api/src/error-codes.ts` | `SHAPI-10006` for missing Azure config |
| Add fetch type declaration | `packages/shell-api/src/database.ts` or new `.d.ts` | Minimal `fetch` type since `lib` lacks it |
| Add unit tests | `packages/shell-api/src/database.spec.ts` | Follow existing `stubInterface<ServiceProvider>` pattern; stub `globalThis.fetch` |
| Read env vars | Direct `process.env` access | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_MODEL` |
| Collect metadata | Use `this._getCollectionNames()`, `getCollection().estimatedDocumentCount()`, `getCollection().find().limit(5).toArray()` | Cap at 20 collections per FR-003 |
| HTTP to Azure OpenAI | `globalThis.fetch` (Node 20+ built-in) | POST to `${endpoint}/openai/deployments/${model}/responses?api-version=2025-03-01-preview` |
| Return value | `string` (default) or `{ joke, metadata }` (when `showMetadata=true`) | Per FR-008 |
| Error handling | Return friendly strings, don't throw | Per FR-009, FR-010 — match Pattern A from RQ-4 |
