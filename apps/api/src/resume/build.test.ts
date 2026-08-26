import { describe, expect, test } from 'vite-plus/test';
import { parsePageCount } from './build.ts';

describe('page count gate', () => {
  test('reads a one page build', () => {
    expect(parsePageCount('Output written on resume-ai.pdf (1 page, 24512 bytes).')).toBe(1);
  });

  test('reads a silent second page', () => {
    expect(parsePageCount('Output written on /tmp/x/resume-ai.pdf (2 pages, 48000 bytes).')).toBe(
      2,
    );
  });

  test('a log without the line is not silently treated as one page', () => {
    expect(parsePageCount('! LaTeX Error: File not found.')).toBeNull();
  });
});
