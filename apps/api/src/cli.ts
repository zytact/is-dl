import type { SearchOptions } from './types.ts';

export function parseArgs(args: string[]): SearchOptions {
  const options: Partial<SearchOptions> = {
    keywords: '',
    location: '',
    limit: 50,
    outDir: './out',
    debug: false,
    headless: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--keywords':
      case '-k':
        options.keywords = nextArg || '';
        i++;
        break;
      case '--location':
      case '-l':
        options.location = nextArg || '';
        i++;
        break;
      case '--limit':
        options.limit = Number.parseInt(nextArg || '50', 10);
        i++;
        break;
      case '--experience-level':
        options.experienceLevel = nextArg?.split(',') || [];
        i++;
        break;
      case '--remote-only':
        options.remoteOnly = true;
        break;
      case '--posted-within':
        options.postedWithin = nextArg || '';
        i++;
        break;
      case '--job-type':
        options.jobType = nextArg?.split(',') || [];
        i++;
        break;
      case '--out':
      case '-o':
        options.outDir = nextArg || './out';
        i++;
        break;
      case '--debug':
        options.debug = true;
        break;
      case '--no-headless':
        options.headless = false;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  if (!options.keywords) {
    console.error('Error: --keywords is required');
    printHelp();
    process.exit(1);
  }

  return options as SearchOptions;
}

function printHelp() {
  console.log(`
LinkedIn Internship Scraper

Usage:
  bun run index.ts [options]

Options:
  -k, --keywords <query>           Search keywords (required)
  -l, --location <location>        Location (can be "Remote", country, or city)
  --limit <number>                 Maximum number of jobs to scrape (default: 50)
  --experience-level <levels>      Comma-separated experience levels (e.g., "Internship,Entry level")
  --remote-only                    Only show remote jobs
  --posted-within <timeframe>      Filter by posting date (e.g., "Past 24 hours", "Past week", "Past month")
  --job-type <types>               Comma-separated job types (e.g., "Full-time,Part-time,Contract,Internship")
  -o, --out <directory>            Output directory (default: ./out)
  --debug                          Enable debug mode (save screenshots, verbose logs)
  --no-headless                    Show browser window
  -h, --help                       Show this help message

Examples:
  bun run index.ts --keywords "software engineer intern" --location "United States" --limit 30
  bun run index.ts -k "data science" -l "Remote" --remote-only --posted-within "Past week"
  bun run index.ts -k "frontend developer" -l "San Francisco" --experience-level "Internship" --no-headless
`);
}
