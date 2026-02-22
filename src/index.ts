import { parseArgs } from './cli.ts';
import { runScraper } from './scraper.ts';

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  await runScraper(options, console.log);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
