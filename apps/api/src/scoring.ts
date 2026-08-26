import type { ResumeProject } from './resume/build.ts';
import { allTags, resolveVariant } from './resume/schema.ts';
import type { JobListing } from './types.ts';

/**
 * A fixed vocabulary of things a listing can ask for. It is deliberately a flat
 * list: tag presence in, tag presence out, no weights and no model.
 */
export const SKILL_VOCABULARY: readonly string[] = [
  'react',
  'next.js',
  'vue',
  'angular',
  'svelte',
  'typescript',
  'javascript',
  'python',
  'go',
  'rust',
  'java',
  'kotlin',
  'swift',
  'c++',
  'c#',
  'php',
  'ruby',
  'flutter',
  'react native',
  'node.js',
  'express',
  'fastapi',
  'django',
  'flask',
  'spring',
  'graphql',
  'trpc',
  'rest',
  'grpc',
  'websocket',
  'socket.io',
  'webrtc',
  'postgresql',
  'mysql',
  'mongodb',
  'redis',
  'sqlite',
  'elasticsearch',
  'prisma',
  'drizzle',
  'docker',
  'kubernetes',
  'aws',
  'gcp',
  'azure',
  'terraform',
  'ci/cd',
  'github actions',
  'linux',
  'git',
  'tailwind',
  'sass',
  'figma',
  'pytorch',
  'tensorflow',
  'scikit-learn',
  'numpy',
  'pandas',
  'opencv',
  'huggingface',
  'llm',
  'rag',
  'langchain',
  'openai',
  'gemini',
  'prompt engineering',
  'computer vision',
  'nlp',
  'deep learning',
  'machine learning',
  'jest',
  'vitest',
  'pytest',
  'playwright',
  'cypress',
  'webassembly',
  'wasm',
  'kafka',
  'rabbitmq',
  'spark',
  'airflow',
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `socket.io` also matches "socket io" and "socket-io". */
function termRegex(term: string): RegExp {
  const parts = term
    .split(/[^a-z0-9+#]+/i)
    .filter(Boolean)
    .map(escapeRegex);
  return new RegExp(`(?<![a-z0-9])${parts.join('[\\s._/-]*')}(?![a-z0-9])`, 'i');
}

const VOCABULARY = SKILL_VOCABULARY.map((term) => ({ term, regex: termRegex(term) }));

export function tagsInText(text: string): string[] {
  return VOCABULARY.filter(({ regex }) => regex.test(text)).map(({ term }) => term);
}

export interface JobScore {
  jobId: string | null;
  title: string | null;
  company: string | null;
  url: string;
  /** Matched tags over asked-for tags. 0 when the listing names no known skill. */
  score: number;
  askedTags: string[];
  matchedTags: string[];
  unmatchedTags: string[];
  suggestedVariant: string | null;
}

function jobText(job: JobListing): string {
  return [job.title, job.descriptionText, job.requirementsText].filter(Boolean).join('\n');
}

function variantTagSets(project: ResumeProject): Array<{ name: string; tags: Set<string> }> {
  return Object.values(project.variants).map((variant) => {
    const resolved = resolveVariant(project.resume, variant);
    const tags = new Set<string>();
    for (const section of resolved.sections) {
      for (const item of section.items) {
        for (const tag of item.tags) tags.add(tag);
        if (item.kind === 'entry') {
          for (const bullet of item.bullets) for (const tag of bullet.tags) tags.add(tag);
        }
      }
    }
    return { name: variant.name, tags };
  });
}

export function scoreJobs(project: ResumeProject, jobs: JobListing[]): JobScore[] {
  const mine = allTags(project.resume);
  const variants = variantTagSets(project);

  return jobs.map((job) => {
    const askedTags = tagsInText(jobText(job));
    const matchedTags = askedTags.filter((tag) => mine.has(tag));
    const unmatchedTags = askedTags.filter((tag) => !mine.has(tag));

    const best = variants
      .map((variant) => ({
        name: variant.name,
        hits: matchedTags.filter((tag) => variant.tags.has(tag)).length,
      }))
      .sort((a, b) => b.hits - a.hits)[0];

    return {
      jobId: job.jobId,
      title: job.title,
      company: job.companyName,
      url: job.jobUrl,
      score: askedTags.length ? matchedTags.length / askedTags.length : 0,
      askedTags,
      matchedTags,
      unmatchedTags,
      suggestedVariant: best && best.hits > 0 ? best.name : null,
    };
  });
}
