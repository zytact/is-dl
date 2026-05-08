# AGENTS

## Repo shape

- Turborepo monorepo with apps in `apps/api` (Bun + Playwright API/CLI) and `apps/web` (React + Vite + Tailwind).

## Setup

- Install deps at repo root: `bun install`.
- Install Playwright Chromium once: `bunx playwright install chromium` (required for scraper/CLI).

## Dev commands

- All apps: `bun run dev`.
- API only: `bun run dev:api` (kills any process on port 3000 before starting; requires `lsof`).
- Web only: `bun run dev:web` (Vite at 5173).

## Verification

- Lint/format/typecheck from root: `bun run lint`, `bun run format`, `bun run typecheck` (Biom e is the formatter/linter).

## CLI + scraper quirks

- CLI lives in `apps/api`: `bun run cli --keywords "..." --location "..."`.
- First CLI run requires LinkedIn login; session saved to `apps/api/storageState.json` (gitignored).

## Output locations

- Scrape results are written to `apps/api/out` as JSON.
