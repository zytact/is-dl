# AGENTS

Use concise language.

## Repo shape

- Vite+ monorepo with three apps:
  - `apps/api` — Node + Playwright backend with REST API and CLI
  - `apps/web` — React + Vite + Tailwind frontend
  - `apps/tui` — Go TUI

## Setup

- Install deps: `vp install`
- Install Playwright Chromium once: `vp exec playwright install chromium`

## Dev commands

| Command              | What it does               |
| -------------------- | -------------------------- |
| `vp run dev`         | API + web                  |
| `vp run dev:api`     | API only, port 3000        |
| `vp run dev:web`     | Web only, port 5173        |
| `vp run dev:tui`     | API + TUI, API logs hidden |
| `vp run dev:api:tui` | Alias for `dev:tui`        |
| `vp run build`       | Build all apps             |
| `vp check`           | Format, lint, typecheck    |
| `vp test run`        | Tests                      |

## apps/api

- **Entry:** `src/server.ts` (Node HTTP server on port 3000)
- **Routes:** All under `/api/`; manual `if url.pathname === ...`.
- **Scraper:** `src/scraper.ts`; `runScraper()` handles pagination, details, output JSON, abort signal, 1-3s rate limit.
- **Browser:** `src/linkedin/browser.ts`; saves session to `storageState.json`.
- **Output:** `apps/api/out/`; format `{ meta: {...}, jobs: [...] }`.
- **State:** In-memory module vars.
- **CLI:** `src/cli.ts` parses args; `src/index.ts` runs scraper.

## apps/web

- **Router:** TanStack Router, code routes in `src/router.tsx`.
- **Routes:** `/`, `/results`.
- **API:** Direct `fetch` to `http://localhost:3000/api/*`.
- **Styling:** Tailwind CSS v4 via `@tailwindcss/vite`.

## apps/tui

- **Go package:** `github.com/arnab/is-dl-tui`
- **NPM package:** `@repo/tui`
- **Framework:** Bubble Tea.
- **HTTP:** `api.NewClient("http://localhost:3000")`.
- **SSE:** `/api/logs` goroutine -> Bubble Tea channel.

## CLI

```bash
vp run --filter @repo/api cli -- --keywords "..." --location "..."
```

## Tech notes

- API CORS open.
- Oxlint/Oxfmt configured in root `vite.config.ts`.
- Vite+ hooks via `prepare: vp config`.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
