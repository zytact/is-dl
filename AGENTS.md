# AGENTS

## Repo shape

- Turborepo monorepo with three apps:
  - `apps/api` — Bun + Playwright backend with REST API and CLI
  - `apps/web` — React + Vite + Tailwind frontend
  - `apps/tui` — Go TUI (standalone, not wired to api/web yet)

## Setup

- Install deps at repo root: `bun install`
- Install Playwright Chromium once: `bunx playwright install chromium` (required for scraper/CLI)

## Dev commands

| Command | What it does |
|---|---|
| `bun run dev` | All apps (turbo) |
| `bun run dev:api` | API only (kills port 3000 first via `lsof`) |
| `bun run dev:web` | Web only (port 5173) |
| `bun run dev:tui` | Go TUI (`go run ./...`) |
| `bun run dev:api:tui` | API + TUI concurrently |
| `bun run build` | Build all apps |
| `bun run lint` | Biome check all apps |
| `bun run format` | Biome format all apps |
| `bun run typecheck` | TypeScript check all apps |

## apps/api

- **Entry point:** `src/server.ts` (Bun HTTP server on port 3000)
- **Routes:** All under `/api/` — no path aliases, no router library. Each route is a manual `if url.pathname === ...` check.
- **Scraper:** `src/scraper.ts` — `runScraper()` drives the full scrape loop: paginate, click cards, extract details, write JSON. Uses `AbortSignal` for abort. Built-in 1–3s rate limiting between job clicks.
- **Browser:** `src/linkedin/browser.ts` — Playwright setup; saves session to `storageState.json` (gitignored) for auth persistence.
- **Output:** Writes to `src/../out/` (relative to `import.meta.dir`). Format is `{ meta: {...}, jobs: [...] }`.
- **State:** In-memory — no DB. `isScraping`, `currentLogs`, `sseControllers` are module-level vars.
- **CLI:** `src/cli.ts` — pure arg parser; scraper logic lives in `scraper.ts`. Both share `types.ts`.

## apps/web

- **Router:** TanStack Router with code-based route definitions in `src/router.tsx` (no file-based routing).
- **Routes:** `/` → `routes/index.tsx` (scraper form + SSE logs), `/results` → `routes/results.tsx` (results dashboard).
- **API calls:** Direct `fetch` to `http://localhost:3000/api/*`.
- **Styling:** Tailwind CSS v4 via `@tailwindcss/vite` plugin (not PostCSS).

## apps/tui

- **Package name:** `github.com/arnab/is-dl-tui`
- **Framework:** Bubble Tea (Charmbracelet) — `tea.Program` with `AltScreen` + mouse support.
- **HTTP client:** `api.NewClient("http://localhost:3000")` — hardcoded API URL.
- **SSE:** Streams logs from `/api/logs` via a goroutine, forwards events via a Go channel to the Bubble Tea model.
- **Status:** Not yet wired to the API or web app; runs standalone.

## CLI

Run CLI from root or `apps/api`:
```bash
bun run cli --keywords "..." --location "..."
```
First run opens browser for LinkedIn login; session saved to `apps/api/storageState.json` (gitignored).

## Scraped output

Results written to `apps/api/out/` as `linkedin-jobs.<timestamp>.json`.

## Tech notes

- API CORS is open for all origins
- Scraper has built-in 1–3s rate limiting between job extractions
- Biome config: `quoteStyle: "single"`, `indentStyle: "space"`
