# Feature Specification: db.crackJokes() Command

**Branch**: users/andrewkhoma/sih2026  |  **Created**: 2026-03-29  |  **Status**: Draft
**Input Brief**: Add a `db.crackJokes()` command that collects database metadata, combines it with a user-provided topic description, and calls Azure OpenAI to generate a dad joke about the data.

## Overview

MongoDB Shell users spend significant time working with databases — inspecting collections, querying documents, and managing schemas. The `db.crackJokes()` command brings levity to this workflow by generating contextual dad jokes that reference the user's actual data. A user provides a short description of what kind of joke they want, and the command gathers metadata from the current database — collection names, document counts, field structures, and sample documents — then sends it along with the description to an Azure-hosted OpenAI instance to produce a personalized dad joke.

The Azure OpenAI connection is configured entirely through environment variables, keeping credentials out of code and shell history. The command works across all MongoDB topologies and returns a structured result containing both the joke and metadata about what was used to generate it.

## Objectives

- Enable users to generate contextual, data-aware dad jokes directly from the mongo shell
- Collect database metadata (collections, schemas, sample docs) to inform joke generation
- Integrate with Azure OpenAI using secure, environment-variable-based credential management
- Return structured results that include the joke and generation metadata
- Follow existing conventions for new database commands to ensure consistency with the rest of the shell

## User Scenarios & Testing

### User Story P1 – Generate a Dad Joke About My Data

Narrative: A developer working in their `ecommerce` database wants a laugh. They type `db.crackJokes("make a joke about my product catalog")` and get back a dad joke referencing their actual collection names and data patterns.

Independent Test: Run `db.crackJokes("anything")` against a database with at least one collection and verify a joke is returned in the expected document format.

Acceptance Scenarios:
1. Given a database with collections and valid Azure OpenAI env vars configured, When the user runs `db.crackJokes("tell me something about my data")`, Then a document is returned with `{ joke: <string>, metadata: { collectionsUsed: [...], model: <string> } }`
2. Given a database with multiple collections, When the user runs `db.crackJokes("joke about users")`, Then the metadata includes the collection names that were inspected
3. Given valid configuration, When the command runs, Then sample documents (up to 5 per collection) are included in the prompt sent to Azure OpenAI

### User Story P2 – Clear Feedback When Configuration Is Missing

Narrative: A user tries `db.crackJokes("hello")` without setting up Azure OpenAI environment variables. Instead of a cryptic error, they see a friendly message explaining exactly which variables to set.

Independent Test: Unset all Azure OpenAI env vars and run `db.crackJokes("test")` — verify a helpful error message is returned (not thrown).

Acceptance Scenarios:
1. Given `AZURE_OPENAI_ENDPOINT` is not set, When the user runs `db.crackJokes("test")`, Then a plain-language message is returned listing the required environment variables and setup steps
2. Given `AZURE_OPENAI_API_KEY` is not set, When the user runs `db.crackJokes("test")`, Then a plain-language message is returned explaining the API key is missing
3. Given `AZURE_OPENAI_MODEL` is not set, When the user runs `db.crackJokes("test")`, Then a plain-language message is returned explaining the model name is missing
4. Given all env vars are set but the API key is invalid, When the user runs `db.crackJokes("test")`, Then a plain-language error message is returned explaining the API call failed (no stack trace)

### User Story P3 – Works on Empty Databases

Narrative: A user runs `db.crackJokes("surprise me")` on a fresh, empty database. The command still produces a joke, though it's based on the fact that the database is empty rather than on collection data.

Independent Test: Run `db.crackJokes("surprise me")` on an empty database and verify a joke is returned.

Acceptance Scenarios:
1. Given a database with no collections, When the user runs `db.crackJokes("surprise me")`, Then a joke is returned (referencing the emptiness of the database)
2. Given a database with empty collections (no documents), When the user runs `db.crackJokes("tell me about my data")`, Then a joke is returned referencing the collection names even without document samples

### Edge Cases

- Database has hundreds of collections: only the first 20 collections are inspected per FR-003
- Sample documents contain very large fields (>1000 characters) or binary data: these are truncated or omitted per FR-011
- Azure OpenAI returns an empty or malformed response: return an actionable error message
- Network timeout when calling Azure OpenAI: return an actionable error with timeout context
- User passes an empty string as the description: treat as a generic joke request (no error)
- User passes an extremely long description string: truncate to 500 characters before sending

## Requirements

### Functional Requirements

- FR-001: Add `db.crackJokes(description)` command to the shell, accepting a single optional string parameter. An empty string or missing argument is treated as a generic joke request (Stories: P1, P3)
- FR-002: Collect metadata from the current database: collection names, document counts, field/schema info from each collection, and up to 5 sample documents per collection (Stories: P1, P3)
- FR-003: Cap metadata collection to at most 20 collections when the database has many collections to control prompt size and token cost (Stories: P1)
- FR-004: Read Azure OpenAI configuration from environment variables: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_MODEL` (Stories: P1, P2)
- FR-005: Construct a prompt combining the collected metadata and user description, instructing the model to generate a dad joke (Stories: P1)
- FR-006: Make an HTTP request to the Azure OpenAI endpoint with the constructed prompt (Stories: P1)
- FR-007: Return a structured document: `{ joke: string, metadata: { collectionsUsed: string[], model: string } }` (Stories: P1)
- FR-008: Return an actionable, plain-language error message (no stack traces) when required environment variables are missing, listing the variable names and setup steps (Stories: P2)
- FR-009: Return an actionable, plain-language error message when the API call fails (invalid key, network error, timeout, rate limit), describing the failure without exposing the API key value (Stories: P2)
- FR-010: Handle empty databases and empty collections gracefully, still producing a joke (Stories: P3)
- FR-011: Truncate document fields longer than 1000 characters and omit binary data fields before including them in the prompt (Stories: P1)
- FR-012: Follow existing conventions for new database commands to ensure consistency (Stories: P1)

### Key Entities

- **Return document**: The user-visible return value containing `joke` (string) and `metadata` (object with `collectionsUsed` array and `model` string)

### Cross-Cutting / Non-Functional

- Environment variables must never appear in telemetry, logs, or error messages
- The API key must not be logged, persisted, or included in shell history
- The command should work on all topologies: standalone, replica set, sharded cluster

## Success Criteria

- SC-001: Running `db.crackJokes("any topic")` on a populated database returns a document with `joke` (non-empty string) and `metadata.collectionsUsed` (non-empty array) (FR-001, FR-002, FR-005, FR-006, FR-007)
- SC-002: Running the command without any `AZURE_OPENAI_*` environment variables returns a helpful string message (not an exception) explaining setup steps (FR-004, FR-008)
- SC-003: Running the command on an empty database returns a joke document without errors (FR-010)
- SC-004: Error messages returned by the command never contain the API key value (FR-009)
- SC-005: On a database with more than 20 collections, `metadata.collectionsUsed` in the returned document contains at most 20 entries (FR-003)

## Assumptions

- The Azure OpenAI endpoint accepts standard API key authentication
- The `AZURE_OPENAI_MODEL` variable contains a valid model name available on the user's Azure OpenAI resource (e.g., `gpt-4o`)
- Dad jokes are the desired humor style — no configurable tone/style setting is needed for v1
- The shell can make outbound HTTP requests to external endpoints from within a database command

## Scope

In Scope:
- New `db.crackJokes(description)` command
- Database metadata collection (collections, schemas, sample docs)
- Azure OpenAI API integration via environment variables
- Structured return format with joke and metadata
- Graceful error handling for missing config and API failures
- Prompt construction logic

Out of Scope:
- Support for non-Azure OpenAI providers (OpenAI direct, Anthropic, etc.)
- Persistent configuration (config file, mongosh settings)
- Joke history or caching
- Custom system prompts or tone configuration
- Streaming responses
- Token usage tracking or cost management

## Dependencies

- Azure OpenAI Responses API availability at user-configured endpoint
- Ability to make outbound HTTP requests from the shell environment

## Risks & Mitigations

- **Data privacy**: Sample documents are sent to an external API. Mitigation: This is user-initiated, uses the user's own Azure OpenAI instance (not a shared service), and documentation should clearly state that data is sent externally.
- **Token cost**: Large databases could generate expensive prompts. Mitigation: Cap collections inspected and sample documents per collection; truncate large fields.
- **API availability**: Azure OpenAI may be unreachable. Mitigation: Friendly error messages with actionable context (timeout, auth failure, etc.).
- **Prompt injection**: Malicious data in documents could manipulate the AI prompt. Mitigation: Low risk for a joke command, but the system prompt should clearly constrain output to dad jokes only.

## References

- Azure OpenAI Responses API: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses
- WorkflowContext: .paw/work/crack-jokes-command/WorkflowContext.md
