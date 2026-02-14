# is-dl

LinkedIn Internship Scraper - Extract job postings from LinkedIn and export to JSON.

## Installation

Install dependencies:

```bash
bun install
```

Install Playwright browsers:

```bash
bunx playwright install chromium
```

## Usage

### Basic Usage

```bash
bun run index.ts --keywords "software engineer intern" --location "United States" --limit 30
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
bun run index.ts -k "data science" -l "Remote" --remote-only --posted-within "Past week"
```

**Search for frontend developer positions with browser visible:**
```bash
bun run index.ts -k "frontend developer" -l "San Francisco" --experience-level "Internship" --no-headless
```

**Search with multiple filters:**
```bash
bun run index.ts -k "machine learning" -l "United States" --limit 20 --job-type "Internship,Full-time" --posted-within "Past month"
```

## Output

The scraper generates a JSON file in the output directory:

- `linkedin-jobs.<timestamp>.json` - Job data in JSON format

### Output Structure

```json
{
  "meta": {
    "query": "software engineer intern",
    "location": "United States",
    "filters": { ... },
    "scrapedAt": "2026-01-27T...",
    "source": "linkedin",
    "count": 30
  },
  "jobs": [
    {
      "jobId": "12345",
      "jobUrl": "https://...",
      "title": "Software Engineering Intern",
      "companyName": "Example Corp",
      "locationText": "San Francisco, CA",
      "workplaceType": "Hybrid",
      "postedAtText": "2 days ago",
      "postedAtIso": "2026-01-25T...",
      "employmentType": "Internship",
      "descriptionText": "...",
      ...
    }
  ]
}
```

## Goal

Going through LinkedIn is a mess. It is filled with trash posts and wastes time. The goal of this project is to find internships on LinkedIn based on search keywords. Then the task is to get all the data, namely, position title, how long ago it was posted, location, description, requirements, company, job type etc in a json.

## Development

**Format code:**
```bash
bun run format
```

**Lint code:**
```bash
bun run lint
```

**Type check:**
```bash
bunx tsc -p tsconfig.json --noEmit
```

## Notes

- Session state is saved in `storageState.json` (gitignored)
- Rate limiting is built-in (1-3 second delay between job extractions)
- The scraper uses Playwright with Chromium for reliable extraction
- Location can be flexible: "Remote", "United States", "San Francisco, CA", etc.

This project was created using `bun init` in bun v1.3.6. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
