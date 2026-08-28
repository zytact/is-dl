import { describe, expect, test } from 'vite-plus/test';
import { CliError } from '../errors.ts';
import { parseInline, plainInline } from './inline.ts';
import { renderInline } from './latex.ts';

const render = (text: string) => renderInline(parseInline(text, 'test'));
const plain = (text: string) => plainInline(parseInline(text, 'test'));

describe('inline markup', () => {
  test('plain prose passes through escaped and unchanged', () => {
    expect(render('Shipped 100% of it.')).toBe('Shipped 100\\% of it.');
  });

  test('bold wraps only the marked words', () => {
    expect(render('Built it in **Rust** and shipped')).toBe(
      'Built it in \\textbf{Rust} and shipped',
    );
  });

  test('a link keeps its text and escapes only what breaks href', () => {
    expect(render('([PR #2563](https://github.com/metabrainz/picard/pull/2563))')).toBe(
      '(\\href{https://github.com/metabrainz/picard/pull/2563}{PR \\#2563})',
    );
  });

  test('bold nests inside a link', () => {
    expect(render('[the **big** one](https://x.test)')).toBe(
      '\\href{https://x.test}{the \\textbf{big} one}',
    );
  });

  test('a link nests inside bold', () => {
    expect(render('**see [docs](https://x.test)**')).toBe(
      '\\textbf{see \\href{https://x.test}{docs}}',
    );
  });

  test('leaf text is escaped once, never the markup output', () => {
    expect(render('**50%**')).toBe('\\textbf{50\\%}');
  });

  test('a backslash escapes markup so it stays literal', () => {
    expect(render('a \\**b\\** c')).toBe('a **b** c');
    expect(render('\\[not a link]')).toBe('[not a link]');
  });

  test('a lone asterisk is literal', () => {
    expect(render('2 * 3 = 6')).toBe('2 * 3 = 6');
  });

  test('brackets without a url are not a link', () => {
    expect(() => parseInline('[just brackets]', 'test')).toThrow(CliError);
  });

  test('unclosed bold is a config error rather than stray asterisks in the pdf', () => {
    expect(() => parseInline('**never closed', 'test')).toThrow(CliError);
  });

  test('an empty link url is a config error', () => {
    expect(() => parseInline('[text]()', 'test')).toThrow(CliError);
  });

  test('a trailing backslash is a config error', () => {
    expect(() => parseInline('ends with \\', 'test')).toThrow(CliError);
  });

  test('the plain text drops markup, so extraction probes match the pdf', () => {
    expect(plain('Fixed **100+** issues ([PR #2548](https://x.test))')).toBe(
      'Fixed 100+ issues (PR #2548)',
    );
  });
});
