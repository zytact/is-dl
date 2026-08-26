import { describe, expect, test } from 'vite-plus/test';
import { CliError } from '../errors.ts';
import { escapeLatex, escapeUrl, renderSection } from './latex.ts';
import { parseResume, parseVariants, resolveVariant } from './schema.ts';

describe('latex escaping', () => {
  const cases: Array<[string, string]> = [
    ['U-Net++ segmentation masks', 'U-Net++ segmentation masks'],
    ['C++ and C#', 'C++ and C\\#'],
    ['reducing user confusion by 30%', 'reducing user confusion by 30\\%'],
    ['(PR #2563)', '(PR \\#2563)'],
    ['R&D and Q&A', 'R\\&D and Q\\&A'],
    ['snake_case_name', 'snake\\_case\\_name'],
    ['${HOME}', '\\$\\{HOME\\}'],
    ['~/.config', '\\textasciitilde{}/.config'],
    ['2^10 growth', '2\\textasciicircum{}10 growth'],
    ['a < b > c', 'a \\textless{} b \\textgreater{} c'],
    ['Full Stack | Internship', 'Full Stack \\textbar{} Internship'],
    ['C:\\Users', 'C:\\textbackslash{}Users'],
    ['₹25,000 per month', '\\faRupeeSign{}25,000 per month'],
  ];

  for (const [input, expected] of cases) {
    test(`escapes ${input}`, () => {
      expect(escapeLatex(input)).toBe(expected);
    });
  }

  test('escaping is not applied twice', () => {
    expect(escapeLatex(escapeLatex('50%'))).toBe('50\\textbackslash{}\\%');
  });

  test('urls only escape what breaks href', () => {
    expect(escapeUrl('https://example.com/a_b?x=1&y=2#frag')).toBe(
      'https://example.com/a_b?x=1&y=2\\#frag',
    );
  });
});

const RESUME = `
basics:
  name: "Ada L"
  headline: "Engineer"
  contacts:
    - icon: "faGithub"
      text: "github.com/ada"
      url: "https://github.com/ada"
sections:
  - id: "work"
    title: "Experience"
    items:
      - id: "a"
        role: "Engineer"
        org: "Corp & Co"
        right: "2026"
        tags: ["rust"]
        bullets:
          - id: "a1"
            text: "Shipped 100% of it."
            tags: ["rust"]
          - id: "a2"
            text: "Wrote C++ glue."
            tags: ["c++"]
      - id: "b"
        role: "Intern"
        tags: []
        bullets: []
  - id: "skills"
    title: "Skills"
    items:
      - id: "s"
        label: "Languages"
        text: "Rust, C++"
        tags: ["rust"]
`;

describe('body rendering', () => {
  const resume = parseResume(RESUME, 'test');

  test('only uses environments the frozen preamble defines', () => {
    const tex = resume.sections.map(renderSection).join('\n');
    const environments = [...tex.matchAll(/\\begin\{(\w+)\}/g)].map((match) => match[1]);
    expect(new Set(environments)).toEqual(new Set(['twocolentry', 'onecolentry', 'highlights']));
  });

  test('bullet text is escaped', () => {
    expect(renderSection(resume.sections[0]!)).toContain('\\item Shipped 100\\% of it.');
  });

  test('an entry with no bullets emits no highlights block', () => {
    const section = renderSection({
      ...resume.sections[0]!,
      items: [resume.sections[0]!.items[1]!],
    });
    expect(section).not.toContain('highlights');
  });
});

const VARIANTS = `
variants:
  lean:
    headline: "Rust Engineer"
    sections: [work]
    lead: [b]
    drop: [a2]
`;

describe('variant resolution', () => {
  const resume = parseResume(RESUME, 'test');
  const variants = parseVariants(VARIANTS, 'test');

  test('lead reorders, drop removes, sections filter', () => {
    const resolved = resolveVariant(resume, variants.lean!);
    expect(resolved.sections.map((section) => section.id)).toEqual(['work']);
    expect(resolved.sections[0]!.items.map((item) => item.id)).toEqual(['b', 'a']);
    const first = resolved.sections[0]!.items[1]!;
    expect(first.kind === 'entry' && first.bullets.map((bullet) => bullet.id)).toEqual(['a1']);
  });

  test('a tag filter drops text items whose own tags do not match', () => {
    const withSkills = resolveVariant(resume, {
      ...variants.lean!,
      sections: ['work', 'skills'],
      drop: [],
      tags: ['c++'],
    });
    const skills = withSkills.sections.find((section) => section.id === 'skills');
    expect(skills?.items.map((item) => item.id) ?? []).toEqual([]);
  });

  test('a tag filter keeps text items whose own tags match', () => {
    const withSkills = resolveVariant(resume, {
      ...variants.lean!,
      sections: ['work', 'skills'],
      drop: [],
      tags: ['rust'],
    });
    const skills = withSkills.sections.find((section) => section.id === 'skills');
    expect(skills?.items.map((item) => item.id) ?? []).toEqual(['s']);
  });

  test('a tag filter keeps only bullets carrying one of those tags', () => {
    const resolved = resolveVariant(resume, { ...variants.lean!, drop: [], tags: ['c++'] });
    const entry = resolved.sections[0]!.items.find((item) => item.id === 'a')!;
    expect(entry.kind === 'entry' && entry.bullets.map((bullet) => bullet.id)).toEqual(['a2']);
  });

  test('an unknown id in a variant is a config error', () => {
    expect(() => resolveVariant(resume, { ...variants.lean!, drop: ['nope'] })).toThrow(CliError);
  });

  test('duplicate ids are rejected at parse time', () => {
    expect(() => parseResume(RESUME.replace('id: "b"', 'id: "a"'), 'test')).toThrow(CliError);
  });
});
