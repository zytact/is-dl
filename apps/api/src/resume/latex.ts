import { CliError } from '../errors.ts';
import type { Inline } from './inline.ts';
import type { Contact, EntryItem, ResolvedVariant, Section, TextItem } from './schema.ts';

const ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  '<': '\\textless{}',
  '>': '\\textgreater{}',
  '|': '\\textbar{}',
  // fontawesome5 is already in the frozen preamble and works under both engines,
  // unlike a bare U+20B9 which pdfTeX cannot encode.
  '₹': '\\faRupeeSign{}',
};

const ESCAPE_RE = /[\\&%$#_{}~^<>|₹]/g;

/** The one escape function. Every piece of resume prose goes through it. */
export function escapeLatex(text: string): string {
  return text.replace(ESCAPE_RE, (char) => ESCAPES[char] ?? char);
}

/** URLs go into \href, where only these three characters are unsafe. */
export function escapeUrl(url: string): string {
  return url.replace(/[\\#%]/g, (char) => `\\${char}`);
}

const ICON = /^fa[A-Za-z0-9]+\*?$/;

function icon(name: string): string {
  if (!ICON.test(name)) {
    throw new CliError(
      'CONFIG',
      `Invalid fontawesome icon "${name}". Expected a name like faGlobe.`,
    );
  }
  return `\\${name}`;
}

function link(url: string | undefined, text: string, command = 'href'): string {
  const escaped = escapeLatex(text);
  return url ? `\\${command}{${escapeUrl(url)}}{${escaped}}` : escaped;
}

/** Renders parsed prose. Only leaf text is escaped, so escaping still runs once. */
export function renderInline(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case 'text':
          return escapeLatex(node.text);
        case 'bold':
          return `\\textbf{${renderInline(node.children)}}`;
        case 'link':
          return `\\href{${escapeUrl(node.url)}}{${renderInline(node.children)}}`;
      }
    })
    .join('');
}

function contactLine(contacts: Contact[]): string {
  const separator = '\n     \\kern 10.0 pt%\n     \\AND%\n     \\kern 10.0 pt%\n     ';
  return contacts
    .map(
      (contact) =>
        `${icon(contact.icon)} \\kern 3pt \\mbox{${link(contact.url, contact.text, 'hrefWithoutArrow')}}%`,
    )
    .join(separator);
}

export interface BodyBasics {
  name: string;
  location?: string;
  locationIcon?: string;
  contacts: Contact[];
}

function header(variant: ResolvedVariant, basics: BodyBasics): string {
  const location = basics.location
    ? `\n        \\normalsize\n     ${icon(basics.locationIcon ?? 'faMapMarker*')} \\kern 3pt \\mbox{${escapeLatex(basics.location)}}%\n\n        \\vspace{3 pt}\n`
    : '';

  return `    \\begin{header}
        \\fontsize{25 pt}{25 pt}\\selectfont ${escapeLatex(basics.name)}

        \\vspace{3 pt}

        \\normalsize ${escapeLatex(variant.headline)}

        \\vspace{2 pt}
${location}
        \\normalsize
     ${contactLine(basics.contacts)}

    \\end{header}
`;
}

function entry(item: EntryItem): string {
  const right = item.right ? link(item.rightUrl, item.right) : '';
  const heading = item.org
    ? `\\textbf{${escapeLatex(item.role)}}, ${escapeLatex(item.org)}`
    : `\\textbf{${escapeLatex(item.role)}}`;

  const head = `    \\begin{twocolentry}{
        ${right}
    }
        ${heading}\\end{twocolentry}
`;

  if (!item.bullets.length) return head;

  const bullets = item.bullets
    .map((bullet) => `            \\item ${renderInline(bullet.text)}`)
    .join('\n');

  return `${head}
    \\vspace{0.10 cm}
    \\begin{onecolentry}
        \\begin{highlights}
${bullets}
        \\end{highlights}
    \\end{onecolentry}
`;
}

function textItem(item: TextItem): string {
  const label = item.label ? `\\textbf{${escapeLatex(item.label)}:} ` : '';
  return `    \\begin{onecolentry}
        ${label}${renderInline(item.text)}
    \\end{onecolentry}
`;
}

export function renderSection(section: Section): string {
  const items = section.items.map((item) => (item.kind === 'entry' ? entry(item) : textItem(item)));
  return `    \\section{${escapeLatex(section.title)}}\n\n${items.join('\n    \\vspace{0.08 cm}\n\n')}`;
}

export interface BodyInput {
  basics: BodyBasics;
  variant: ResolvedVariant;
}

/** Emits only environments the frozen preamble already defines. */
export function renderBody(input: BodyInput): string {
  const sections = input.variant.sections.map(renderSection).join('\n');
  return `${header(input.variant, input.basics)}
    \\vspace{5 pt - 0.3 cm}

${sections}`;
}
