import { writeFile } from 'node:fs/promises';
import { encode } from '@toon-format/toon';
import type { ScraperOutput } from './types.ts';

export async function writeOutput(
  data: ScraperOutput,
  outDir: string,
): Promise<{ jsonPath: string; toonPath: string }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = `${outDir}/linkedin-jobs.${timestamp}.json`;
  const toonPath = `${outDir}/linkedin-jobs.${timestamp}.toon`;

  // Write JSON
  const jsonContent = JSON.stringify(data, null, 2);
  await writeFile(jsonPath, jsonContent, 'utf-8');
  console.log(`JSON output written to: ${jsonPath}`);

  // Write TOON
  const toonContent = encode(data);
  await writeFile(toonPath, toonContent, 'utf-8');
  console.log(`TOON output written to: ${toonPath}`);

  return { jsonPath, toonPath };
}
