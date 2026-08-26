export const ExitCode = {
  OK: 0,
  ERROR: 1,
  USAGE: 2,
  AUTH_REQUIRED: 3,
  DEPENDENCY: 4,
  ABORTED: 5,
  CONFIG: 6,
} as const;

export type ExitCodeName = keyof typeof ExitCode;

export class CliError extends Error {
  /** Set when the command already printed its own report. */
  readonly silent: boolean;

  constructor(
    readonly code: ExitCodeName,
    message: string,
    options: { silent?: boolean } = {},
  ) {
    super(message);
    this.name = 'CliError';
    this.silent = options.silent ?? false;
  }

  get exit(): number {
    return ExitCode[this.code];
  }
}
