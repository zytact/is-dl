import type { UnstopOptions } from '../types.ts';

export const UNSTOP_SEARCH_URL = 'https://unstop.com/api/public/opportunity/search-result';

/** Above 100 the endpoint silently drops rows. */
export const MAX_PER_PAGE = 100;

export interface UnstopJobDetail {
  min_salary?: number | null;
  max_salary?: number | null;
  currency?: string | null;
  pay_in?: string | null;
  paid_unpaid?: string | null;
  show_salary?: number | null;
  not_disclosed?: boolean | null;
  type?: string | null;
  timing?: string | null;
  locations?: string[] | null;
}

export interface UnstopItem {
  id: number;
  title: string;
  /** Registration fees, never compensation. Read `jobDetail` for pay. */
  isPaid?: boolean | null;
  details?: string | null;
  jobDetail?: UnstopJobDetail | null;
  organisation?: { name?: string | null; public_url?: string | null } | null;
  seo_url?: string | null;
  public_url?: string | null;
  approved_date?: string | null;
  updated_at?: string | null;
  locations?: Array<{
    city?: string | null;
    state?: string | null;
    country?: string | null;
  }> | null;
  required_skills?: Array<{
    skill?: string | null;
    pivot?: { ai_generated?: boolean | null } | null;
  }> | null;
}

export interface UnstopPage {
  items: UnstopItem[];
  currentPage: number;
  lastPage: number;
  total: number;
}

interface RawResponse {
  data?: {
    data?: unknown;
    current_page?: unknown;
    last_page?: unknown;
    total?: unknown;
  };
}

function count(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function buildSearchUrl(options: UnstopOptions, page: number): string {
  const params = new URLSearchParams({
    opportunity: options.opportunity,
    oppstatus: 'open',
    page: String(page),
    per_page: String(MAX_PER_PAGE),
  });
  const roles = options.roles?.filter(Boolean);
  if (roles?.length) params.set('roles', roles.join(','));
  return `${UNSTOP_SEARCH_URL}?${params.toString()}`;
}

export function parsePage(body: unknown): UnstopPage {
  const payload = (body as RawResponse)?.data;
  const items = Array.isArray(payload?.data) ? (payload.data as UnstopItem[]) : [];
  return {
    items,
    currentPage: count(payload?.current_page, 1),
    lastPage: count(payload?.last_page, 1),
    total: count(payload?.total, items.length),
  };
}

/** The endpoint is under robots.txt `Allow: /api/public/*` and needs no auth. */
export async function fetchPage(
  options: UnstopOptions,
  page: number,
  signal?: AbortSignal,
): Promise<UnstopPage> {
  const url = buildSearchUrl(options, page);
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal });
  if (!response.ok) {
    throw new Error(`Unstop returned ${response.status} ${response.statusText} for ${url}`);
  }
  return parsePage(await response.json());
}
