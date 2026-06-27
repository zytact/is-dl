# is-dl

LinkedIn Internship Scraper - Extract job postings from LinkedIn and export to JSON.

This is a monorepo built with [Turborepo](https://turbo.build/) containing:

- `apps/api` - Bun + Playwright backend with REST API and CLI
- `apps/web` - React + Vite + Tailwind + TanStack Router frontend

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
bun run dev:api   # Backend only (port 3000)
bun run dev:web   # Frontend only (port 5173)
```

## Web Interface

Open `http://localhost:5173` after starting the apps.

**Features:**

- **Scraper Form** - Configure search with keywords, location, filters
- **Real-time Logs** - Terminal-style output via SSE
- **Results Dashboard** - View all scraped datasets in a table
- **Results Inspector** - Drill down into individual job listings
- **Export All** - Download all results as a ZIP file
- **Delete Results** - Purge individual datasets
- **Abort Control** - Stop running scrapes mid-execution

## API Endpoints

The backend runs at `http://localhost:3000`:

| Method | Endpoint                 | Description                   |
| ------ | ------------------------ | ----------------------------- |
| POST   | `/api/scrape`            | Start a scrape job            |
| POST   | `/api/abort`             | Abort active scrape           |
| GET    | `/api/logs`              | SSE stream for real-time logs |
| GET    | `/api/results`           | List all saved results        |
| GET    | `/api/results/:filename` | Get specific result file      |
| DELETE | `/api/results/:filename` | Delete a result file          |
| GET    | `/api/results/export`    | Export all results as ZIP     |

### Scrape Request Body

```json
{
    "keywords": "software engineer intern",
    "location": "United States",
    "limit": 50,
    "remoteOnly": false,
    "experienceLevel": "Internship",
    "jobType": "Full-time,Part-time",
    "postedWithin": "Past week",
    "headless": true,
    "debug": false
}
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

The scraper generates JSON files in `apps/api/out`:

- `linkedin-jobs.<timestamp>.json` - Job data in JSON format

Each job includes `aiAgentSignals` for rules-based detection of AI coding-agent/tool mentions. `meta.aiAgentSummary` includes detected/high/medium/low counts for quick LLM review.

### Data Extracted Per Job

```typescript
interface JobListing {
    jobId: string | null;
    jobUrl: string;
    title: string | null;
    companyName: string | null;
    companyUrl: string | null;
    locationText: string | null;
    postedAtText: string | null; // "3 days ago"
    postedAtIso: string | null; // ISO timestamp
    jobType: string | null;
    alumniCount: string | null; // "X alumni work here"
    descriptionText: string | null;
    requirementsText: string | null;
    aiAgentSignals: AiAgentSignals;
}
```

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
│   ├── api/                      # Bun + Playwright backend
│   │   ├── src/
│   │   │   ├── server.ts         # REST API server
│   │   │   ├── cli.ts            # CLI entry point
│   │   │   ├── scraper.ts        # Main scraper logic
│   │   │   ├── types.ts          # TypeScript interfaces
│   │   │   ├── output.ts         # Output formatting
│   │   │   ├── normalize.ts      # Data normalization
│   │   │   └── linkedin/         # LinkedIn-specific modules
│   │   │       ├── browser.ts    # Browser setup & auth
│   │   │       ├── search.ts     # Search page scraping
│   │   │       ├── job.ts        # Job detail extraction
│   │   │       └── search-url.ts # URL builder
│   │   ├── out/                  # Scraped output
│   │   └── package.json
│   └── web/                      # React + Vite frontend
│       ├── src/
│       │   ├── routes/
│       │   │   ├── index.tsx     # Scraper form + logs
│       │   │   └── results.tsx   # Results dashboard
│       │   ├── components/
│       │   │   ├── ScraperForm.tsx
│       │   │   ├── TerminalLogs.tsx
│       │   │   ├── ResultsDashboard.tsx
│       │   │   └── ResultsInspector.tsx
│       │   ├── router.tsx
│       │   └── main.tsx
│       └── package.json
├── turbo.json         # Turborepo pipeline config
├── biome.json         # Unified linter/formatter
├── tsconfig.json      # Shared TypeScript base config
└── package.json       # Root workspace config
```

## Tech Stack

**Backend:**

- [Bun](https://bun.sh) - Runtime & HTTP server
- [Playwright](https://playwright.dev) - Browser automation
- [Archiver](https://www.archiverjs.com) - ZIP export

**Frontend:**

- [React 19](https://react.dev) - UI framework
- [Vite](https://vite.dev) - Build tool
- [Tailwind CSS 4](https://tailwindcss.com) - Styling
- [TanStack Router](https://tanstack.com/router) - Routing
- [Motion](https://motion.dev) - Animations
- [Lucide](https://lucide.dev) - Icons

## Goal

Going through LinkedIn is a mess. It is filled with trash posts and wastes time. The goal of this project is to find internships on LinkedIn based on search keywords. Then the task is to get all the data, namely, position title, how long ago it was posted, location, description, requirements, company, job type etc in a JSON which you can preferably feed to an AI.

## Notes

- Session state is saved in `apps/api/storageState.json` (gitignored)
- Rate limiting is built-in (1-3 second delay between job extractions)
- The scraper uses Playwright with Chromium for reliable extraction
- Location can be flexible: "Remote", "United States", "San Francisco, CA", etc.
- CORS is enabled for all API endpoints

Built with [Bun](https://bun.sh) and [Turborepo](https://turbo.build).
