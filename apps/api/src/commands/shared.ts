import { CliError } from '../errors.ts';

export const GLOBAL_OPTIONS = {
  json: { type: 'boolean' },
  quiet: { type: 'boolean', short: 'q' },
  verbose: { type: 'boolean' },
  config: { type: 'string' },
  'no-config': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'V' },
} as const;

/** Turns a parseArgs rejection into the documented usage exit code. */
export function usage<T>(parse: () => T): T {
  try {
    return parse();
  } catch (err) {
    throw new CliError('USAGE', err instanceof Error ? err.message : String(err));
  }
}
