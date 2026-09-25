import { parse as parseYaml } from 'yaml';
import { CliError } from '../errors.ts';
import { isSafeFileName } from '../fs.ts';
import { type Inline, parseInline } from './inline.ts';

export interface Contact {
  icon: string;
  text: string;
  url?: string;
}

export interface Basics {
  name: string;
  headline: string;
  location?: string;
  locationIcon?: string;
  contacts: Contact[];
}

export interface Bullet {
  id: string;
  text: Inline[];
  tags: string[];
}

export interface EntryItem {
  kind: 'entry';
  id: string;
  role: string;
  org?: string;
  right?: string;
  rightUrl?: string;
  tags: string[];
  bullets: Bullet[];
}

export interface TextItem {
  kind: 'text';
  id: string;
  label?: string;
  text: Inline[];
  tags: string[];
}

export type Item = EntryItem | TextItem;

export interface Section {
  id: string;
  title: string;
  items: Item[];
}

export interface Resume {
  basics: Basics;
  sections: Section[];
}

export interface Variant {
  name: string;
  headline: string;
  sections: string[];
  lead: string[];
  drop: string[];
  tags: string[];
}

export type Variants = Record<string, Variant>;

function fail(where: string, message: string): never {
  throw new CliError('CONFIG', `${where}: ${message}`);
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(where, 'expected a mapping');
  }
  return value as Record<string, unknown>;
}

function str(raw: Record<string, unknown>, key: string, where: string): string {
  const value = raw[key];
  if (typeof value !== 'string' || !value.trim())
    fail(where, `"${key}" must be a non-empty string`);
  return value;
}

function inline(raw: Record<string, unknown>, key: string, where: string): Inline[] {
  return parseInline(str(raw, key, where), where);
}

function optStr(raw: Record<string, unknown>, key: string, where: string): string | undefined {
  const value = raw[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') fail(where, `"${key}" must be a string`);
  return value;
}

function strList(raw: Record<string, unknown>, key: string, where: string): string[] {
  const value = raw[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fail(where, `"${key}" must be a list of strings`);
  }
  return value as string[];
}

function list(raw: Record<string, unknown>, key: string, where: string): unknown[] {
  const value = raw[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(where, `"${key}" must be a list`);
  return value;
}

function readYaml(text: string, where: string): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    fail(where, err instanceof Error ? err.message : String(err));
  }
  return record(raw, where);
}

function parseItem(raw: unknown, where: string): Item {
  const item = record(raw, where);
  const id = str(item, 'id', where);
  const at = `${where} item "${id}"`;
  const tags = strList(item, 'tags', at);

  if ('text' in item && !('role' in item)) {
    return {
      kind: 'text',
      id,
      label: optStr(item, 'label', at),
      text: inline(item, 'text', at),
      tags,
    };
  }

  const bullets = list(item, 'bullets', at).map((entry) => {
    const bullet = record(entry, `${at} bullet`);
    const bulletId = str(bullet, 'id', `${at} bullet`);
    return {
      id: bulletId,
      text: inline(bullet, 'text', `${at} bullet "${bulletId}"`),
      tags: strList(bullet, 'tags', `${at} bullet "${bulletId}"`),
    };
  });

  return {
    kind: 'entry',
    id,
    role: str(item, 'role', at),
    org: optStr(item, 'org', at),
    right: optStr(item, 'right', at),
    rightUrl: optStr(item, 'rightUrl', at),
    tags,
    bullets,
  };
}

export function parseResume(text: string, where: string): Resume {
  const raw = readYaml(text, where);
  const basicsRaw = record(raw.basics, `${where} basics`);

  const contacts = list(basicsRaw, 'contacts', `${where} basics`).map((entry, i) => {
    const contact = record(entry, `${where} basics contact ${i + 1}`);
    return {
      icon: str(contact, 'icon', `${where} basics contact ${i + 1}`),
      text: str(contact, 'text', `${where} basics contact ${i + 1}`),
      url: optStr(contact, 'url', `${where} basics contact ${i + 1}`),
    };
  });

  const basics: Basics = {
    name: str(basicsRaw, 'name', `${where} basics`),
    headline: str(basicsRaw, 'headline', `${where} basics`),
    location: optStr(basicsRaw, 'location', `${where} basics`),
    locationIcon: optStr(basicsRaw, 'locationIcon', `${where} basics`),
    contacts,
  };

  const sections = list(raw, 'sections', where).map((entry) => {
    const section = record(entry, `${where} section`);
    const id = str(section, 'id', `${where} section`);
    return {
      id,
      title: str(section, 'title', `${where} section "${id}"`),
      items: list(section, 'items', `${where} section "${id}"`).map((item) =>
        parseItem(item, `${where} section "${id}"`),
      ),
    };
  });

  const resume: Resume = { basics, sections };
  assertUniqueIds(resume, where);
  return resume;
}

function assertUniqueIds(resume: Resume, where: string): void {
  const seen = new Set<string>();
  const claim = (id: string, what: string) => {
    if (seen.has(id)) fail(where, `duplicate ${what} id "${id}"`);
    seen.add(id);
  };
  for (const section of resume.sections) {
    claim(section.id, 'section');
    for (const item of section.items) {
      claim(item.id, 'item');
      if (item.kind === 'entry') for (const bullet of item.bullets) claim(bullet.id, 'bullet');
    }
  }
}

export function parseVariants(text: string, where: string): Variants {
  const raw = readYaml(text, where);
  const variantsRaw = record(raw.variants, `${where} variants`);

  const variants: Variants = {};
  const folders = new Set<string>();
  for (const [name, value] of Object.entries(variantsRaw)) {
    const at = `${where} variant "${name}"`;
    if (!isSafeFileName(name)) {
      fail(at, 'a variant name is its build folder, so use only letters, digits, ".", "_" and "-"');
    }
    if (folders.has(name.toLowerCase())) {
      fail(at, 'differs from another variant only by case, so both would build into one folder');
    }
    folders.add(name.toLowerCase());
    const variant = record(value, at);
    for (const key of Object.keys(variant)) {
      if (!['headline', 'sections', 'lead', 'drop', 'tags'].includes(key)) {
        fail(at, `unknown key "${key}". Known keys: headline, sections, lead, drop, tags`);
      }
    }
    variants[name] = {
      name,
      headline: str(variant, 'headline', at),
      sections: strList(variant, 'sections', at),
      lead: strList(variant, 'lead', at),
      drop: strList(variant, 'drop', at),
      tags: strList(variant, 'tags', at),
    };
  }
  return variants;
}

export interface ResolvedVariant {
  name: string;
  headline: string;
  sections: Section[];
}

/**
 * Selection only. `drop` removes ids, `lead` pulls ids to the front of their
 * section, `tags` keeps bullets that carry at least one of those tags. Nothing
 * here rewrites a single word of the source text.
 */
export function resolveVariant(resume: Resume, variant: Variant): ResolvedVariant {
  const known = new Set<string>();
  for (const section of resume.sections) {
    known.add(section.id);
    for (const item of section.items) {
      known.add(item.id);
      if (item.kind === 'entry') for (const bullet of item.bullets) known.add(bullet.id);
    }
  }
  for (const id of [...variant.sections, ...variant.lead, ...variant.drop]) {
    if (!known.has(id)) {
      throw new CliError('CONFIG', `Variant "${variant.name}" references unknown id "${id}".`);
    }
  }

  const dropped = new Set(variant.drop);
  const leadRank = new Map(variant.lead.map((id, i) => [id, i]));
  const wanted = variant.sections.length ? variant.sections : resume.sections.map((s) => s.id);

  const sections = wanted.flatMap((sectionId) => {
    const section = resume.sections.find((s) => s.id === sectionId);
    if (!section || dropped.has(section.id)) return [];

    const items = section.items
      .filter((item) => !dropped.has(item.id))
      .filter((item) => textItemMatchesTags(item, variant.tags))
      .map((item) => filterBullets(item, variant.tags, dropped))
      .filter((item) => item.kind === 'text' || item.bullets.length > 0 || item.tags.length === 0);

    const ordered = items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => rank(leadRank, a) - rank(leadRank, b))
      .map(({ item }) => item);

    return ordered.length ? [{ ...section, items: ordered }] : [];
  });

  return { name: variant.name, headline: variant.headline, sections };
}

function rank(leadRank: Map<string, number>, entry: { item: Item; index: number }): number {
  const lead = leadRank.get(entry.item.id);
  return lead === undefined ? 1000 + entry.index : lead;
}

/**
 * Text items carry no bullets, so a tag filter has to match their own tags.
 * Entry items are already narrowed by their bullets.
 */
function textItemMatchesTags(item: Item, tags: string[]): boolean {
  if (item.kind !== 'text') return true;
  return !tags.length || !item.tags.length || item.tags.some((tag) => tags.includes(tag));
}

function filterBullets(item: Item, tags: string[], dropped: Set<string>): Item {
  if (item.kind === 'text') return item;
  const bullets = item.bullets
    .filter((bullet) => !dropped.has(bullet.id))
    .filter((bullet) => !tags.length || bullet.tags.some((tag) => tags.includes(tag)));
  return { ...item, bullets };
}
