import { CliError } from '../errors.ts';

/**
 * Prose fields in resume.yaml are a tiny markup, not a plain string: `**bold**`
 * for emphasis and `[text](url)` for links. A backslash escapes the next
 * character. Everything else is literal.
 *
 * The markup marks up words the author already wrote. It never adds, reorders
 * or rewrites them, so a built PDF still reads verbatim from resume.yaml.
 */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; children: Inline[] }
  | { kind: 'link'; url: string; children: Inline[] };

class Parser {
  private index = 0;

  constructor(
    private readonly source: string,
    private readonly where: string,
  ) {}

  /** Reads until `stop` matches, or to the end of the source when it is undefined. */
  parse(stop?: '**' | ']'): Inline[] {
    const nodes: Inline[] = [];
    let literal = '';

    const flush = () => {
      if (literal) nodes.push({ kind: 'text', text: literal });
      literal = '';
    };

    while (this.index < this.source.length) {
      if (stop && this.source.startsWith(stop, this.index)) {
        this.index += stop.length;
        flush();
        return nodes;
      }

      const char = this.source[this.index]!;

      if (char === '\\') {
        const next = this.source[this.index + 1];
        if (next === undefined) this.fail('a trailing backslash escapes nothing');
        literal += next;
        this.index += 2;
      } else if (this.source.startsWith('**', this.index)) {
        this.index += 2;
        flush();
        nodes.push({ kind: 'bold', children: this.parse('**') });
      } else if (char === '[') {
        this.index += 1;
        flush();
        nodes.push(this.linkFrom(this.parse(']')));
      } else {
        literal += char;
        this.index += 1;
      }
    }

    if (stop) this.fail(stop === '**' ? 'unclosed "**"' : 'unclosed "["');
    flush();
    return nodes;
  }

  /** `[text]` is only a link when a `(url)` follows it immediately. */
  private linkFrom(children: Inline[]): Inline {
    if (this.source[this.index] !== '(') this.fail('a link "[text]" needs a "(url)" after it');
    const end = this.source.indexOf(')', this.index);
    if (end === -1) this.fail('unclosed "(" in a link url');
    const url = this.source.slice(this.index + 1, end).trim();
    if (!url) this.fail('a link url is empty');
    this.index = end + 1;
    return { kind: 'link', url, children };
  }

  private fail(message: string): never {
    throw new CliError('CONFIG', `${this.where}: ${message} in ${JSON.stringify(this.source)}`);
  }
}

export function parseInline(text: string, where: string): Inline[] {
  return new Parser(text, where).parse();
}

/** The words without the markup. The PDF text extraction gate probes with these. */
export function plainInline(nodes: Inline[]): string {
  return nodes
    .map((node) => (node.kind === 'text' ? node.text : plainInline(node.children)))
    .join('');
}
