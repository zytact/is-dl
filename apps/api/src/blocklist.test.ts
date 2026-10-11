import { expect, test } from 'vite-plus/test';
import { blockedCompanies } from './blocklist.ts';

test.each([
  ['UM IT', 'UM IT PRIVATE LIMITED', true],
  ['um it', 'UM IT Solutions', true],
  ['by UM', 'WebBoost Solutions by UM', true],
  ['UM IT', 'Premium IT Services', false],
  ['Uni.AiHUb', 'uni aihub', true],
  ["Dexter's Tech", 'Dexter’s  Tech', true],
  ['internmo', 'internmode', false],
  ['Solutions UM', 'UM IT Solutions', false],
])('entry %j against company %j blocks: %j', (entry, company, blocked) => {
  expect(blockedCompanies([entry]).has(company)).toBe(blocked);
});

test('an entry with no letters or digits blocks nothing', () => {
  expect(blockedCompanies(['', ' - ']).has('Acme')).toBe(false);
});
