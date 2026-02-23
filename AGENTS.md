# AGENTS.md

Welcome to the `is-dl` project. This guide provides essential instructions and context for AI coding agents operating within this repository.

This is a **Turborepo monorepo** with two apps:

1. **Backend (`apps/api`)**: A scraping API built with Bun, TypeScript, and Playwright.
2. **Frontend (`apps/web`)**: A React web interface built with Vite, Tailwind CSS v4, and Framer Motion.

---

## 1. Available Commands

Execute commands from the **root directory**. Turborepo handles routing to the correct app.

### Installation & Setup

```bash
# Install all dependencies (root + apps)
bun install

# Install Playwright browsers (for backend)
bunx playwright install chromium
```

### Development Servers

```bash
# Starts both apps concurrently
bun run dev

# Starts only the backend API (clears port 3000 if occupied)
bun run dev:api

# Starts only the frontend web
bun run dev:web
```

### Linting & Formatting

Biome is used for both apps:

```bash
# Lint all apps
bun run lint

# Auto-format all apps
bun run format

# Lint and auto-fix standard issues
bunx biome check --write
```

### Typechecking

```bash
# Typecheck all apps
bun run typecheck
```

### Testing (Bun Test)

Currently, no test suite is configured. When tests are added, they should use Bun's fast native test runner.

```bash
# Run all tests in the project
bun test

# Run a specific test file
bun test apps/api/src/services/scraper.test.ts

# Run tests matching a specific name/pattern
bun test -t "should correctly parse LinkedIn data"

# Run tests in watch mode
bun test --watch
```

---

## 2. Code Style Guidelines

### General TypeScript Conventions

- **Strictness:** Maintain `strict: true`. Avoid type assertions (`as Type`) unless absolutely necessary.
- **Typing Boundaries:** Use `unknown` for untrusted or external data (like scraping results or API requests). Validate explicitly before casting.
- **Types vs Interfaces:** Prefer `type` aliases for complex unions or intersections. Use `interface` for declarative object shapes.
- **Mutability:** Prefer `readonly` arrays (`readonly string[]`) and objects. Do not mutate shared objects.
- **Imports/Exports:** Use ESM imports. Prefer explicit named imports over default imports. Keep imports at the top of the file. Let Biome organize your imports automatically.

### Formatting & Naming

- **Formatting:** Let Biome handle the formatting. Do not override Biome's choices manually.
- **File Naming:** Use `kebab-case.ts` or `kebab-case.tsx` for all files (e.g., `job-parser.ts`, `data-table.tsx`).
- **Variables & Functions:** Use `camelCase`.
- **Classes & Types:** Use `PascalCase`.
- **Constants:** Use `SCREAMING_SNAKE_CASE` for global or module-level constants only.
- **Booleans:** Prefix boolean variables with `is`, `has`, `should`, or `can` (e.g., `isLoading`, `hasError`).

### Architecture & Control Flow

- **Early Returns:** Prefer early returns to reduce nesting (Guard Clauses).
- **Switch Statements:** Use them when it improves readability over `if/else`, and ensure all cases are exhaustive (or include a default).
- **Loops:** Prefer `for..of` loops when awaiting async operations sequentially.
- **Async/Await:** Avoid raw `.then()` chaining. Use `await Promise.all(...)` when operations can run in parallel.

### Error Handling

- **Never throw strings.** Always throw standard `Error` objects or custom subclasses.
- **Contextualize Errors:** When catching errors at system boundaries (e.g., Playwright network failures), wrap them to provide context, preserving the original error with the `cause` property:
    ```ts
    try {
        await page.goto(url);
    } catch (error) {
        throw new Error(`Failed to load LinkedIn page for URL: ${url}`, {
            cause: error,
        });
    }
    ```
- **Expected Failures:** For expected domain failures (like a missing DOM element during scraping), consider returning a `Result` type (e.g., `{ success: false, reason: 'Selector not found' }`) rather than throwing an exception.

---

## 3. Project-Specific Directives

### Backend (apps/api) - Bun + Playwright

- **Scraping Stability:** Web scraping is brittle. Build resilient CSS selectors. Use Playwright's auto-waiting features (`page.locator()`) rather than arbitrary `page.waitForTimeout()` calls.
- **Data Parsing:** Isolate DOM traversal logic from data transformation logic. Extract parsing into pure, testable functions.

### Frontend (apps/web) - React + Tailwind

- **Component Design:** Use functional components with hooks. Keep components small and focused.
- **Styling:** Utilize Tailwind CSS v4. When conditional class names are required, use `clsx` and `tailwind-merge` (typically wrapped in a `cn()` utility).
- **State Management:** Keep state as localized as possible. Use React Context only when prop-drilling becomes overly cumbersome.
- **Animations:** Use `motion` (can be installed with `bun install motion`) formerly `framer-motion` for complex UI transitions.
- **Icons:** Use `lucide-react` for iconography.

---

## 4. Project Structure

```
is-dl/
├── apps/
│   ├── api/           # Backend (Bun + Playwright)
│   │   ├── src/
│   │   ├── out/       # Scraped output
│   │   └── package.json
│   └── web/           # Frontend (React + Vite)
│       ├── src/
│       └── package.json
├── turbo.json         # Turborepo pipeline config
├── biome.json         # Unified linter/formatter
├── tsconfig.json      # Shared TypeScript base config
└── package.json       # Root workspace config
```

---

## 5. Agent Workflow Rules

1. **Verify Your Work:** Always run `bun run lint`, `bun run format`, and `bun run typecheck` after making substantial changes. Do not leave the codebase with build errors. Do not try to workaround them. Always go for the long-term proper solution.
2. **Context is King:** Before creating new functions or components, use `glob` and `grep` to ensure similar utilities don't already exist.
3. **Patience with UI:** When dealing with Playwright selectors, confirm the page structure before writing heavy extraction logic.
4. **Existing Editor Rules:** Note that there are currently no `.cursorrules`, `.cursor/rules/`, or `.github/copilot-instructions.md` applied in this repository. Use this `AGENTS.md` file as the definitive source of truth for repository behavior.
