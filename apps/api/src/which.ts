import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/** PATH lookup without a shell, so it behaves the same on Windows. */
export function whichSync(command: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const extensions =
    process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];

  for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(dir, command + extension);
      try {
        if (!statSync(candidate).isFile()) continue;
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Not here, keep looking.
      }
    }
  }
  return null;
}
