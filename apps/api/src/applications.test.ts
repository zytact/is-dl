import { describe, expect, test } from 'vite-plus/test';
import {
  type ApplicationRecord,
  currentState,
  historyFor,
  recordSource,
  seenKey,
} from './applications.ts';

function record(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    jobId: '4123456789',
    company: 'Acme',
    title: 'Backend Developer',
    url: null,
    variant: null,
    appliedAt: '2026-08-20T10:00:00.000Z',
    recordedAt: '2026-08-20T10:00:00.000Z',
    source: 'manual',
    status: 'applied',
    ...overrides,
  };
}

describe('source-qualified job keys', () => {
  test('the same id on two boards stays two applications', () => {
    const states = currentState([
      record({ jobId: '1744984', jobSource: 'linkedin' }),
      record({ jobId: '1744984', jobSource: 'unstop' }),
    ]);
    expect([...states.keys()]).toEqual(['linkedin:1744984', 'unstop:1744984']);
  });

  test('a later record replaces the earlier one for the same board', () => {
    const states = currentState([
      record({ jobId: '77', jobSource: 'unstop', status: 'applied' }),
      record({ jobId: '77', jobSource: 'unstop', status: 'rejected' }),
    ]);
    expect(states.size).toBe(1);
    expect(states.get(seenKey('unstop', '77'))?.status).toBe('rejected');
  });

  test('records written before Unstop are read as LinkedIn', () => {
    const legacy = record({ jobId: '4123456789' });
    expect(recordSource(legacy)).toBe('linkedin');
    expect([...currentState([legacy]).keys()]).toEqual(['linkedin:4123456789']);
  });

  test('history can be narrowed to one board', () => {
    const records = [
      record({ jobId: '5', jobSource: 'linkedin' }),
      record({ jobId: '5', jobSource: 'unstop' }),
    ];
    expect(historyFor(records, '5')).toHaveLength(2);
    expect(historyFor(records, '5', 'unstop')).toHaveLength(1);
  });
});
