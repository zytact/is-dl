import { expect, test } from 'vite-plus/test';
import { CliError } from './errors.ts';
import { readSearchBody } from './search.ts';

test('a body reads like the search flags', () => {
  expect(
    readSearchBody({
      keywords: 'developer',
      location: '',
      limit: 5,
      sources: 'linkedin, unstop',
      unstopRoles: ['software-development'],
      experienceLevel: '',
      excludeSeen: true,
    }),
  ).toEqual({
    flags: {
      keywords: 'developer',
      limit: 5,
      sources: ['linkedin', 'unstop'],
      unstopRoles: ['software-development'],
    },
    triage: { excludeUnpaid: false, excludeApplied: false, excludeSeen: true },
  });
});

test.each([
  [{ keywords: 'x', limit: '5' }, '"limit" must be a number.'],
  [{ keywords: 'x', excludeSeen: 'yes' }, '"excludeSeen" must be a boolean.'],
  [{ keywords: 'x', outDir: '/tmp' }, 'Unknown field "outDir"'],
  [[], 'The request body must be a JSON object.'],
])('rejects %j', (body, message) => {
  expect(() => readSearchBody(body)).toThrow(CliError);
  expect(() => readSearchBody(body)).toThrow(message);
});
