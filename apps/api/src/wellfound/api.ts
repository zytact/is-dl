import { CliError } from '../errors.ts';

export const WF_ORIGIN = 'https://wellfound.com';

/** One `JobListingSearchResult` with its startup folded in, keeping only the fields the source reads. */
export interface WfListing {
  id: string;
  slug: string;
  title: string | null;
  description: string | null;
  /** Lowercase, as in "full-time" or "internship". */
  jobType: string | null;
  /** Unix seconds. */
  liveStartAt: number | null;
  locationNames: string[];
  remote: boolean;
  acceptedRemoteLocationNames: string[];
  /** Salary and equity joined by a bullet, as in "₹9.6L – ₹12L • No equity". */
  compensation: string | null;
  yearsExperienceMin: number | null;
  yearsExperienceMax: number | null;
  companyName: string | null;
  companySlug: string | null;
  companyConcept: string | null;
}

export interface WfPage {
  listings: WfListing[];
  pageCount: number;
}

/** Where a search page looks. A location is Wellfound's own slug, such as "india" or "bangalore". */
export type Place =
  | { kind: 'everywhere' }
  | { kind: 'remote' }
  | { kind: 'location'; slug: string };

export function searchPageUrl(role: string, place: Place, page: number): string {
  const path =
    place.kind === 'remote'
      ? `/role/r/${role}`
      : place.kind === 'location'
        ? `/role/l/${role}/${place.slug}`
        : `/role/${role}`;
  return `${WF_ORIGIN}${path}${page > 1 ? `?page=${page}` : ''}`;
}

function formatError(url: string, missing: string): CliError {
  return new CliError(
    'ERROR',
    `Wellfound's page at ${url} has no ${missing}. Wellfound may have changed its page format.`,
  );
}

function blockedError(url: string, reason: string): CliError {
  return new CliError(
    'ERROR',
    `Wellfound blocked the request for ${url} (${reason}). Its Cloudflare check now guards the search pages, so try again later.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.flatMap((item) => text(item) ?? []))] : [];
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Apollo normalizes nested objects into `{ __ref: "Type:id" }` pointers. */
function deref(state: Record<string, unknown>, value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || typeof value.__ref !== 'string') return null;
  const target = state[value.__ref];
  return isRecord(target) ? target : null;
}

/** Null without an id and a slug, the two fields the job URL is built from. */
function readListing(
  value: Record<string, unknown>,
  startup: Record<string, unknown>,
): WfListing | null {
  const id = text(value.id);
  const slug = text(value.slug);
  if (id === null || slug === null || !/^\d+$/.test(id) || !/^[a-z0-9-]+$/.test(slug)) return null;

  const companySlug = text(startup.slug);
  return {
    id,
    slug,
    title: text(value.title),
    description: text(value.description),
    jobType: text(value.jobType),
    liveStartAt: count(value.liveStartAt),
    locationNames: texts(value.locationNames),
    remote: value.remote === true,
    acceptedRemoteLocationNames: texts(value.acceptedRemoteLocationNames),
    compensation: text(value.compensation),
    yearsExperienceMin: count(value.yearsExperienceMin),
    yearsExperienceMax: count(value.yearsExperienceMax),
    companyName: text(startup.name),
    companySlug: companySlug && /^[a-z0-9-]+$/.test(companySlug) ? companySlug : null,
    companyConcept: text(startup.highConcept),
  };
}

/**
 * The page is a Next.js app that ships its Apollo cache in `__NEXT_DATA__`.
 * The search result lists startups, and each startup lists its open jobs.
 * It is an internal format, so each read is checked.
 */
export function parseSearchPage(html: string, url: string): WfPage {
  const script = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (script === undefined) {
    if (/challenge-platform|<title>Just a moment/i.test(html)) {
      throw blockedError(url, 'a Cloudflare challenge page');
    }
    throw formatError(url, '"__NEXT_DATA__" script');
  }

  let data: unknown;
  try {
    data = JSON.parse(script);
  } catch {
    throw formatError(url, 'readable JSON in "__NEXT_DATA__"');
  }
  const pageProps = isRecord(data) && isRecord(data.props) ? data.props.pageProps : null;
  const apollo = isRecord(pageProps) ? pageProps.apolloState : null;
  const state = isRecord(apollo) && isRecord(apollo.data) ? apollo.data : null;
  if (state === null) throw formatError(url, 'Apollo state');

  const query = isRecord(state.ROOT_QUERY) ? state.ROOT_QUERY.talent : null;
  const results = isRecord(query)
    ? Object.entries(query).find(([key]) => key.startsWith('seoLandingPageJobSearchResults('))?.[1]
    : null;
  if (!isRecord(results) || !Array.isArray(results.startups)) {
    throw formatError(url, 'job search results');
  }

  const listings = results.startups.flatMap((ref) => {
    const startup = deref(state, ref);
    if (startup === null) throw formatError(url, 'startup behind every result');
    const jobs = Array.isArray(startup.highlightedJobListings)
      ? startup.highlightedJobListings
      : [];
    return jobs.map((jobRef) => {
      const job = deref(state, jobRef);
      const listing = job && readListing(job, startup);
      if (!listing) throw formatError(url, '"id" and "slug" on every listing');
      return listing;
    });
  });
  return { listings, pageCount: count(results.pageCount) ?? 1 };
}

/**
 * Redirects are refused: Wellfound answers an unknown role or location with a
 * 303 to a broader page, which would quietly search the wrong thing.
 */
async function fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    headers: { accept: 'text/html' },
    redirect: 'manual',
    signal,
  });
  if (response.status >= 300 && response.status < 400) {
    throw new CliError(
      'USAGE',
      `Wellfound has no page at ${url}. Check the role and location slugs, such as software-engineer and india.`,
    );
  }
  if (response.headers.get('cf-mitigated') || [403, 429, 503].includes(response.status)) {
    throw blockedError(url, `HTTP ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(`Wellfound returned ${response.status} ${response.statusText} for ${url}`);
  }
  return response.text();
}

export async function fetchSearchPage(
  role: string,
  place: Place,
  page: number,
  signal?: AbortSignal,
): Promise<WfPage> {
  const url = searchPageUrl(role, place, page);
  return parseSearchPage(await fetchHtml(url, signal), url);
}
