# Agent Notes (is-dl)

This repo is a Bun + TypeScript project. Use Bun for running scripts, and Biome for formatting/linting.

## Quick Commands

### Install

```bash
bun install
```

### Run

```bash
bun run index.ts
```

### Lint / Format (Biome)

```bash
# lint (no write)
bun run lint

# format (writes files)
bun run format

# both (check + auto-fix where possible)
bunx biome check --write
```

Notes:
- Biome config lives in `biome.json`.
- Import organization is enabled (Biome assist).

### Typecheck

There is no dedicated script yet; use TypeScript directly:

```bash
# typecheck only (no emit)
bunx tsc -p tsconfig.json --noEmit
```

If `bunx tsc` fails, ensure `typescript` is installed (it is a peer dependency).

### Tests

No test suite is currently configured in `package.json`.

If/when tests are added, prefer Bun's test runner:

```bash
# run all tests
bun test

# run a single test file
bun test path/to/foo.test.ts

# run tests matching a name/pattern
bun test -t "my test name"

# watch mode
bun test --watch
```

## Repo Conventions

### Runtime and Module System

- Runtime: Bun.
- ESM: `package.json` sets `"type": "module"`.
- Entry point: `index.ts`.
- TS config: `tsconfig.json` uses strict mode and bundler resolution.

### Formatting (Biome)

Follow Biome; do not hand-format around it.

- Indentation: spaces.
- Quotes: single quotes in JS/TS (`biome.json` -> `quoteStyle: 'single'`).
- Imports: let Biome organize them; do not fight the sorter.
- Prefer running `bun run format` after making edits.

### Linting (Biome)

- `bun run lint` runs `biome check` with recommended rules.
- Fixes: use `bunx biome check --write` for auto-fixable issues.
- Keep the codebase warning-free before sending changes for review.

### TypeScript Rules (tsconfig)

This project is intentionally strict:

- `strict: true`.
- `noUncheckedIndexedAccess: true`: handle possibly-undefined index access.
- `noImplicitOverride: true`: use `override` when overriding.
- `noFallthroughCasesInSwitch: true`: use `break`/`return` explicitly.
- `allowImportingTsExtensions: true`: `.ts` extensions are allowed if needed.
- `verbatimModuleSyntax: true`: keep imports/exports semantically correct.

Practical implications:
- When indexing into objects/arrays, guard or use safe defaults.
- Prefer narrowing over assertions; avoid `as` unless justified.

## Code Style Guidelines

### Imports

- Use ESM imports (`import ... from '...'`).
- Keep imports at the top of the file.
- Prefer explicit named imports over deep default imports when available.
- Avoid unused imports; run Biome organize imports.
- Type-only imports: use `import type { Foo } from '...'` when appropriate.

### Naming

- Files: `kebab-case` for multi-word filenames unless the folder already uses a different convention.
- Variables/functions: `camelCase`.
- Classes/types/interfaces: `PascalCase`.
- Constants: `SCREAMING_SNAKE_CASE` only for true module-level constants.
- Booleans: use `is/has/can/should` prefixes (`isReady`, `hasNext`).
- Avoid abbreviations unless they are domain-standard.

### Types

- Prefer `unknown` over `any` at boundaries (network, parsing, user input).
- Prefer `type` aliases for unions/intersections; use `interface` when extension/merging is desired.
- Prefer `readonly` data where helpful; avoid mutating shared objects.
- Prefer `Record<string, T>` only when keys are truly arbitrary.
- Prefer `satisfies` for validating object shapes without widening.

### Control Flow

- Prefer early returns to reduce nesting.
- Use `switch` only when it improves readability; keep cases exhaustive.
- Use `for..of` for async/await loops; avoid `forEach(async () => ...)`.

### Error Handling

- Throw `Error` objects (or subclasses) rather than strings.
- Add context to errors at boundaries (e.g., include operation + key ids).
- When catching, either:
  - handle the error fully, or
  - rethrow with context, preserving the original as `cause`.

Example:

```ts
try {
  await doThing();
} catch (err) {
  throw new Error('doThing failed for jobId=123', { cause: err });
}
```

### Logging

- Prefer structured logs when possible (objects), but keep them readable.
- Do not log secrets/tokens/cookies/credentials.
- Avoid noisy logs in library-like code paths; gate with a flag if needed.

### Async and I/O

- Prefer `await` over raw promise chaining.
- When doing multiple independent awaits, use `await Promise.all([...])`.
- Be explicit about retries/timeouts for network operations.

### Data Parsing / Validation

- Treat external data as untrusted.
- Parse + validate once at the boundary, then pass typed data internally.
- Prefer small parsing helpers that return `Result`-like objects or throw.

### JSON Output

- Keep output schemas stable; document changes.
- Prefer explicit field names and consistent casing.
- Avoid `undefined` in JSON; normalize to `null` or omit consistently.

## Project-Specific Notes

- Goal (from `README.md`): scrape LinkedIn internship postings and export structured JSON, then encode to TOON.
- Entry file `index.ts` is currently a placeholder.

## Agent Workflow

When making changes:

1. Keep edits small and focused; prefer incremental improvements.
2. Run `bun run format` and `bun run lint`.
3. If you add types/non-trivial logic, also run `bunx tsc -p tsconfig.json --noEmit`.
4. If you add tests, ensure single-test instructions in this file stay accurate.

## Editor/Agent Rules

- No Cursor rules found (no `.cursor/rules/` and no `.cursorrules`).
- No GitHub Copilot rules found (no `.github/copilot-instructions.md`).
