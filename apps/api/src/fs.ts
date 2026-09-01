import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

export async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}
