import { expect, test } from 'vite-plus/test';
import { hasLinkedInLogin } from './browser.ts';

const NOW = Date.UTC(2026, 10, 16);
const DAY = 86_400;

test.each([
  [
    'an unexpired li_at',
    [{ name: 'li_at', domain: '.www.linkedin.com', expires: NOW / 1000 + DAY }],
    true,
  ],
  ['a session li_at', [{ name: 'li_at', domain: '.www.linkedin.com', expires: -1 }], true],
  [
    'an expired li_at',
    [{ name: 'li_at', domain: '.www.linkedin.com', expires: NOW / 1000 - DAY }],
    false,
  ],
  [
    'only tracking cookies, as LinkedIn leaves after revoking',
    [{ name: 'bcookie', domain: '.linkedin.com', expires: -1 }],
    false,
  ],
  ['an li_at for another site', [{ name: 'li_at', domain: 'example.com', expires: -1 }], false],
])('a jar with %s is signed in: %s', (_, cookies, expected) => {
  expect(hasLinkedInLogin(cookies, NOW)).toBe(expected);
});
