# Documentation: db.crackJokes() Command

## Summary

Added `db.crackJokes(description?, showMetadata?)` method to the Database shell API class. The command collects metadata from the current database (collection names, document counts, sample documents) and sends it to an Azure-hosted OpenAI instance to generate a contextual dad joke.

## Usage

```javascript
// Basic — returns a joke string
db.crackJokes("tell me about my data")

// With metadata — returns { joke, metadata: { collectionsUsed, deployment } }
db.crackJokes("tell me about my data", true)

// No description — generic joke about the database
db.crackJokes()
```

## Environment Variables

All three are required:

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource URL | `https://your-resource.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | API key for authentication | `your-api-key` |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment name on the resource | `gpt-4o` |

If any are missing, the command returns a consolidated setup message listing all missing variables.

## Implementation Details

### Files Changed

| File | Change |
|------|--------|
| `packages/shell-api/src/database.ts` | `crackJokes` method + `sanitizeDocForPrompt` helper |
| `packages/shell-api/src/error-codes.ts` | `SHAPI-10006` (AzureOpenAIConfigMissing) |
| `packages/shell-api/src/fetch-types.d.ts` | Ambient fetch/Response type declarations |
| `packages/shell-api/src/database.spec.ts` | 24 unit tests |
| `packages/i18n/src/locales/en_US.ts` | Help text translation |

### Metadata Collection

- Collects up to 20 collection names (capped for token cost)
- For each collection: estimated document count + up to 5 sample documents
- Field names extracted from samples
- Documents sanitized recursively: strings >1000 chars truncated, Binary fields omitted
- User description truncated to 500 characters

### API Integration

- Uses Azure OpenAI Responses API via `POST /openai/deployments/{deployment}/responses`
- Stateless single-turn requests (developer + user roles, no conversation threading)
- Developer role sets standup comedian persona constrained to dad jokes
- API key sent via `api-key` header, scrubbed from all error messages

### Error Handling

- Missing config: returns consolidated setup message, emits `SHAPI-10006` via message bus
- API failure: returns actionable message with HTTP status (API key redacted)
- Network timeout: returns timeout-specific error message
- Malformed response: returns "unexpected response" message
- Collection inspection failures: caught individually, collection marked as "Could not inspect"

### Privacy

- User description excluded from telemetry (`_emitDatabaseApiCall` only logs `showMetadata` flag)
- API key never appears in error messages, telemetry, or logs
- Sample documents are sent to the user's own Azure OpenAI instance (not a shared service)

## Verification

```bash
# Compile
npm run compile --workspace @mongosh/shell-api

# Lint
npm run lint --workspace @mongosh/shell-api

# Run crackJokes tests only
cd packages/shell-api && npx mocha --grep "crackJokes" src/database.spec.ts

# Run full test suite
npm run test --workspace @mongosh/shell-api
```
