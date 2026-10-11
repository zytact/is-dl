import type { BlockedCompanies } from './types.ts';

/** Lowercase words joined by single spaces, so case, punctuation and spacing never decide a match. */
function words(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean)
    .join(' ');
}

/**
 * An entry blocks every company whose name contains it as whole words: "UM IT"
 * blocks "UM IT PRIVATE LIMITED" and "UM IT Solutions", and leaves "Premium IT
 * Services" alone.
 */
export function companyBlocklist(entries: readonly string[]): BlockedCompanies {
  const phrases = entries
    .map(words)
    .filter(Boolean)
    .map((phrase) => ` ${phrase} `);
  return {
    has: (companyName) => {
      const name = ` ${words(companyName)} `;
      return phrases.some((phrase) => name.includes(phrase));
    },
  };
}

/** The log line for what a source skipped, naming the companies so a wrong match shows. */
export function blockedSummary(companyNames: readonly string[]): string {
  return `Skipped ${companyNames.length} from blocked companies: ${[...new Set(companyNames)].join(', ')}.`;
}
