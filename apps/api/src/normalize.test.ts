import { describe, expect, test } from 'vite-plus/test';
import { parsePostedTime } from './normalize.ts';

describe('parsePostedTime', () => {
  const units = ['second', 'minute', 'hour', 'day', 'week', 'month'];

  test('resolves every unit LinkedIn uses', () => {
    for (const unit of units) {
      const iso = parsePostedTime(`2 ${unit}s ago`);
      expect(iso, unit).not.toBeNull();
      expect(Date.parse(iso ?? ''), unit).toBeLessThanOrEqual(Date.now());
    }
  });

  test('accepts the singular form', () => {
    expect(parsePostedTime('1 minute ago')).not.toBeNull();
  });

  test('returns null for text it cannot place', () => {
    expect(parsePostedTime('')).toBeNull();
    expect(parsePostedTime('Reposted')).toBeNull();
    expect(parsePostedTime('yesterday')).toBeNull();
  });
});
