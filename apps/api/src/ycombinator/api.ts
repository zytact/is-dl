import { CliError } from '../errors.ts';
import { decodeEntities } from '../html.ts';

export const YC_ORIGIN = 'https://www.ycombinator.com';

/** One `jobPostings` entry, keeping only the fields the source reads. Paths are site-relative. */
export interface YcPosting {
  id: number;
  url: string;
  title: string | null;
  applyUrl: string | null;
  location: string | null;
  type: string | null;
  salaryRange: string | null;
  equityRange: string | null;
  minExperience: string | null;
  visa: string | null;
  skills: string[];
  companyName: string | null;
  companyUrl: string | null;
  companyBatchName: string | null;
  createdAt: string | null;
  lastActive: string | null;
}

/** A role page has no pagination. `/remote` is YC's own remote-only list for the role. */
export function rolePageUrl(role: string, remoteOnly: boolean): string {
  return `${YC_ORIGIN}/jobs/role/${role}${remoteOnly ? '/remote' : ''}`;
}

function formatError(url: string, missing: string): CliError {
  return new CliError(
    'ERROR',
    `Y Combinator's page at ${url} has no ${missing}. Y Combinator may have changed its page format.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The board is an Inertia app: every page ships its data as JSON in the
 * `data-page` attribute. It is an internal format, so each read is checked.
 */
function pageProps(html: string, url: string): Record<string, unknown> {
  const attribute = /data-page="([^"]*)"/.exec(html)?.[1];
  if (attribute === undefined) throw formatError(url, '"data-page" attribute');

  let page: unknown;
  try {
    page = JSON.parse(decodeEntities(attribute));
  } catch {
    throw formatError(url, 'readable JSON in "data-page"');
  }
  if (!isRecord(page) || !isRecord(page.props)) throw formatError(url, '"props" in "data-page"');
  return page.props;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sitePath(value: unknown): string | null {
  const path = text(value);
  return path?.startsWith('/') ? path : null;
}

/** Null without an id and a path, the two fields a listing cannot be kept without. */
function readPosting(value: unknown): YcPosting | null {
  if (!isRecord(value) || typeof value.id !== 'number') return null;
  const url = sitePath(value.url);
  if (url === null) return null;

  const applyUrl = text(value.applyUrl);
  return {
    id: value.id,
    url,
    title: text(value.title),
    applyUrl: applyUrl?.startsWith('https://') ? applyUrl : null,
    location: text(value.location),
    type: text(value.type),
    salaryRange: text(value.salaryRange),
    equityRange: text(value.equityRange),
    minExperience: text(value.minExperience),
    visa: text(value.visa),
    skills: Array.isArray(value.skills) ? value.skills.flatMap((skill) => text(skill) ?? []) : [],
    companyName: text(value.companyName),
    companyUrl: sitePath(value.companyUrl),
    companyBatchName: text(value.companyBatchName),
    createdAt: text(value.createdAt),
    lastActive: text(value.lastActive),
  };
}

export function parseRolePage(html: string, url: string): YcPosting[] {
  const raw = pageProps(html, url).jobPostings;
  if (!Array.isArray(raw)) throw formatError(url, '"jobPostings" list');
  return raw.map((entry) => {
    const posting = readPosting(entry);
    if (posting === null) throw formatError(url, '"id" and "url" on every listing');
    return posting;
  });
}

/** The listing page repeats the posting and adds the description, as markdown. */
export function parseListingPage(html: string, url: string): string | null {
  const job = pageProps(html, url).job;
  if (!isRecord(job)) throw formatError(url, '"job" object');
  return typeof job.description === 'string' ? job.description.trim() || null : null;
}

async function fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, { headers: { accept: 'text/html' }, signal });
  if (!response.ok) {
    throw new Error(`Y Combinator returned ${response.status} ${response.statusText} for ${url}`);
  }
  return response.text();
}

export async function fetchRolePage(
  role: string,
  remoteOnly: boolean,
  signal?: AbortSignal,
): Promise<YcPosting[]> {
  const url = rolePageUrl(role, remoteOnly);
  return parseRolePage(await fetchHtml(url, signal), url);
}

export async function fetchDescription(
  posting: YcPosting,
  signal?: AbortSignal,
): Promise<string | null> {
  const url = `${YC_ORIGIN}${posting.url}`;
  return parseListingPage(await fetchHtml(url, signal), url);
}
