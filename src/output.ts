import { writeFile } from 'node:fs/promises';
import type { ScraperOutput } from './types.ts';

export async function writeOutput(
  data: ScraperOutput,
  outDir: string,
): Promise<{ jsonPath: string }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = `${outDir}/linkedin-jobs.${timestamp}.json`;

  const jsonContent = JSON.stringify(data, null, 2);
  await writeFile(jsonPath, jsonContent, 'utf-8');
  console.log(`JSON output written to: ${jsonPath}`);

  return { jsonPath };
}
