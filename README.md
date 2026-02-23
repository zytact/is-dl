# is-dl

LinkedIn Internship Scraper - Extract job postings from LinkedIn and export to JSON.

This is a monorepo built with [Turborepo](https://turbo.build/) containing:

- `apps/api` - Bun + Playwright backend scraper
- `apps/web` - React + Vite + Tailwind frontend

## Installation

Install dependencies from the root:

```bash
bun install
```

Install Playwright browsers:

```bash
bunx playwright install chromium
```

## Development

Start both apps:

```bash
bun run dev
```

Start specific app:

```bash
bun run dev:api   # Backend only
bun run dev:web   # Frontend only
```

## CLI Usage

Run the scraper CLI from `apps/api`:

```bash
cd apps/api
bun run cli --keywords "software engineer intern" --location "United States" --limit 30
```

### First Run (Authentication)

On the first run, the scraper will open a browser window and prompt you to log in to LinkedIn. After logging in, press Enter in the terminal. Your session will be saved to `storageState.json` for future runs.

### Command-Line Options

```
-k, --keywords <query>           Search keywords (required)
-l, --location <location>        Location (can be "Remote", country, or city)
--limit <number>                 Maximum number of jobs to scrape (default: 50)
--experience-level <levels>      Comma-separated experience levels
--remote-only                    Only show remote jobs
--posted-within <timeframe>      Filter by posting date
--job-type <types>               Comma-separated job types
-o, --out <directory>            Output directory (default: ./out)
--debug                          Enable debug mode
--no-headless                    Show browser window
-h, --help                       Show help message
```

### Examples

**Search for remote internships:**
```bash
cd apps/api
bun run cli -k "data science" -l "Remote" --remote-only --posted-within "Past week"
```

**Search for frontend developer positions with browser visible:**
```bash
cd apps/api
bun run cli -k "frontend developer" -l "San Francisco" --experience-level "Internship" --no-headless
```

## Output

The scraper generates a JSON file in `apps/api/out`:

- `linkedin-jobs.<timestamp>.json` - Job data in JSON format

## Scripts

From the root:

```bash
bun run dev        # Start all apps in dev mode
bun run build      # Build all apps
bun run lint       # Lint all apps
bun run format     # Format all apps
bun run typecheck  # Type check all apps
```

## Project Structure

```
is-dl/
├── apps/
│   ├── api/           # Bun + Playwright backend
│   │   ├── src/
│   │   ├── out/       # Scraped output
│   │   └── package.json
│   └── web/           # React + Vite frontend
│       ├── src/
│       └── package.json
├── turbo.json         # Turborepo pipeline config
├── biome.json         # Unified linter/formatter
├── tsconfig.json      # Shared TypeScript base config
└── package.json       # Root workspace config
```

## Goal

Going through LinkedIn is a mess. It is filled with trash posts and wastes time. The goal of this project is to find internships on LinkedIn based on search keywords. Then the task is to get all the data, namely, position title, how long ago it was posted, location, description, requirements, company, job type etc in a json.

## Notes

- Session state is saved in `apps/api/storageState.json` (gitignored)
- Rate limiting is built-in (1-3 second delay between job extractions)
- The scraper uses Playwright with Chromium for reliable extraction
- Location can be flexible: "Remote", "United States", "San Francisco, CA", etc.

Built with [Bun](https://bun.com) and [Turborepo](https://turbo.build/).
