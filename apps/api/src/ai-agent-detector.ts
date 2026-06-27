import type {
  AiAgentConfidence,
  AiAgentRequirementStrength,
  AiAgentSignalCategory,
  AiAgentSignalSource,
  AiAgentSignals,
  AiAgentSummary,
  JobListing,
} from './types.ts';

interface SourceText {
  source: AiAgentSignalSource;
  text: string;
}

interface MatchHit {
  source: AiAgentSignalSource;
  index: number;
  text: string;
  confidence: AiAgentConfidence;
  tools: string[];
  categories: AiAgentSignalCategory[];
}

interface Rule {
  regex: RegExp;
  confidence: AiAgentConfidence;
  tools?: string[];
  categories: AiAgentSignalCategory[];
  requiresDevContext?: boolean;
  guard?: (text: string, match: RegExpMatchArray) => boolean;
}

const DEV_CONTEXT =
  /\b(code|coding|coder|software|developer|development|engineering|engineer|programming|repo|repository|pull request|pr\b|ide|editor|terminal|cli|debug|test|tests|typescript|javascript|python|go|java|react|frontend|backend|full[-\s]?stack)\b/i;

const REQUIRED_CONTEXT =
  /\b(required|requirement|requirements|must|need(?:ed)?|minimum|qualification|qualifications|proficiency|experience with|hands[-\s]?on)\b/i;

const PREFERRED_CONTEXT =
  /\b(preferred|nice[-\s]?to[-\s]?have|bonus|plus|familiarity|familiar with|optional|desired)\b/i;

const SOURCE_PRIORITY: Record<AiAgentSignalSource, number> = {
  title: 0,
  requirements: 1,
  description: 2,
};

const CONFIDENCE_RANK: Record<AiAgentConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const STRENGTH_RANK: Record<AiAgentRequirementStrength, number> = {
  mentioned: 1,
  preferred: 2,
  required: 3,
};

const TOOL_RULES: Rule[] = [
  {
    regex: /\bclaude[\s-]+code\b/gi,
    confidence: 'high',
    tools: ['Claude Code'],
    categories: ['tool'],
  },
  {
    regex: /\b(openai[\s-]+codex|codex[\s-]+cli|codex[\s-]+(?:coding[\s-]+)?agent)\b/gi,
    confidence: 'high',
    tools: ['OpenAI Codex'],
    categories: ['tool'],
  },
  {
    regex: /\bcursor\b/gi,
    confidence: 'high',
    tools: ['Cursor'],
    categories: ['tool'],
    guard: (text, match) => !nearMatch(text, match.index ?? 0, /\bmouse\s+cursor\b/i),
  },
  {
    regex: /\bopencode\b/gi,
    confidence: 'high',
    tools: ['OpenCode'],
    categories: ['tool'],
  },
  {
    regex: /\bwindsurf\b/gi,
    confidence: 'high',
    tools: ['Windsurf'],
    categories: ['tool'],
  },
  {
    regex: /\bdevin\b/gi,
    confidence: 'high',
    tools: ['Devin'],
    categories: ['tool'],
  },
  {
    regex: /\baider\b/gi,
    confidence: 'high',
    tools: ['Aider'],
    categories: ['tool'],
  },
  {
    regex: /\bcline\b/gi,
    confidence: 'high',
    tools: ['Cline'],
    categories: ['tool'],
  },
  {
    regex: /\broo[\s-]+code\b/gi,
    confidence: 'high',
    tools: ['Roo Code'],
    categories: ['tool'],
  },
  {
    regex: /\b[Cc]ontinue\b/g,
    confidence: 'high',
    tools: ['Continue'],
    categories: ['tool'],
    guard: (text, match) =>
      match[0] === 'Continue' || nearMatch(text, match.index ?? 0, DEV_CONTEXT),
  },
  {
    regex: /\bgithub[\s-]+copilot[\s-]+coding[\s-]+agent\b/gi,
    confidence: 'high',
    tools: ['GitHub Copilot'],
    categories: ['tool'],
  },
  {
    regex: /\b(?:github[\s-]+)?copilot\b/gi,
    confidence: 'medium',
    tools: ['GitHub Copilot'],
    categories: ['tool'],
  },
  {
    regex: /\bclaude\b/gi,
    confidence: 'low',
    tools: ['Claude'],
    categories: ['generic_ai_tooling'],
    guard: (text, match) => !nearMatch(text, match.index ?? 0, /\bclaude[\s-]+code\b/i),
  },
  {
    regex: /\bchatgpt\b/gi,
    confidence: 'low',
    tools: ['ChatGPT'],
    categories: ['generic_ai_tooling'],
    requiresDevContext: true,
  },
  {
    regex: /\bgemini\b/gi,
    confidence: 'low',
    tools: ['Gemini'],
    categories: ['generic_ai_tooling'],
    requiresDevContext: true,
  },
];

const PHRASE_RULES: Rule[] = [
  {
    regex: /\bai[\s-]+coding[\s-]+agents?\b/gi,
    confidence: 'high',
    categories: ['agentic_workflow'],
    requiresDevContext: true,
  },
  {
    regex: /\bagentic[\s-]+(?:coding|development|software[\s-]+engineering)\b/gi,
    confidence: 'high',
    categories: ['agentic_workflow'],
    requiresDevContext: true,
  },
  {
    regex: /\bai[\s-]+assisted[\s-]+(?:development|software[\s-]+engineering|coding)\b/gi,
    confidence: 'medium',
    categories: ['llm_dev_workflow'],
    requiresDevContext: true,
  },
  {
    regex:
      /\bllm[\s-]+(?:powered|assisted)[\s-]+(?:development|coding|software[\s-]+engineering)\b/gi,
    confidence: 'medium',
    categories: ['llm_dev_workflow'],
    requiresDevContext: true,
  },
  {
    regex: /\bprompt[\s-]+engineering\b/gi,
    confidence: 'low',
    categories: ['prompting_for_code'],
    requiresDevContext: true,
  },
  {
    regex: /\b(?:ai|genai)[\s-]+(?:productivity[\s-]+)?tools?\b/gi,
    confidence: 'low',
    categories: ['generic_ai_tooling'],
    requiresDevContext: true,
  },
];

export function emptyAiAgentSignals(): AiAgentSignals {
  return {
    detected: false,
    confidence: null,
    requirementStrength: null,
    tools: [],
    categories: [],
    snippets: [],
  };
}

export function detectAiAgentSignals(input: {
  title?: string | null;
  requirementsText?: string | null;
  descriptionText?: string | null;
}): AiAgentSignals {
  const allSources: SourceText[] = [
    { source: 'title', text: input.title ?? '' },
    { source: 'requirements', text: input.requirementsText ?? '' },
    { source: 'description', text: input.descriptionText ?? '' },
  ];
  const sources = allSources.filter((source) => source.text.trim().length > 0);

  const hits = sources.flatMap(findHits);
  if (hits.length === 0) return emptyAiAgentSignals();

  const tools = unique(hits.flatMap((hit) => hit.tools));
  const categories = unique(hits.flatMap((hit) => hit.categories));
  const requirementStrength = detectRequirementStrength(sources, hits);
  const confidence = applyStrengthBoost(highestConfidence(hits), requirementStrength, categories);

  return {
    detected: true,
    confidence,
    requirementStrength,
    tools,
    categories,
    snippets: selectSnippets(sources, hits),
  };
}

export function summarizeAiAgentSignals(jobs: JobListing[]): AiAgentSummary {
  return jobs.reduce<AiAgentSummary>(
    (summary, job) => {
      const confidence = job.aiAgentSignals?.confidence;
      if (!job.aiAgentSignals?.detected || !confidence) return summary;

      summary.detectedCount += 1;
      if (confidence === 'high') summary.highCount += 1;
      if (confidence === 'medium') summary.mediumCount += 1;
      if (confidence === 'low') summary.lowCount += 1;
      return summary;
    },
    { detectedCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 },
  );
}

function findHits(source: SourceText): MatchHit[] {
  const rules = [...TOOL_RULES, ...PHRASE_RULES];
  const hits: MatchHit[] = [];

  for (const rule of rules) {
    for (const match of source.text.matchAll(rule.regex)) {
      const index = match.index ?? 0;
      if (rule.requiresDevContext && !nearMatch(source.text, index, DEV_CONTEXT)) {
        continue;
      }
      if (rule.guard && !rule.guard(source.text, match)) {
        continue;
      }

      hits.push({
        source: source.source,
        index,
        text: match[0],
        confidence: confidenceForSource(rule.confidence, source.source),
        tools: rule.tools ?? [],
        categories: rule.categories,
      });
    }
  }

  return hits;
}

function confidenceForSource(
  confidence: AiAgentConfidence,
  source: AiAgentSignalSource,
): AiAgentConfidence {
  if (source !== 'description') return confidence;
  if (confidence === 'high') return 'medium';
  return confidence;
}

function detectRequirementStrength(
  sources: SourceText[],
  hits: MatchHit[],
): AiAgentRequirementStrength {
  let strength: AiAgentRequirementStrength = 'mentioned';

  for (const hit of hits) {
    const source = sources.find((item) => item.source === hit.source);
    if (!source) continue;

    const context = sliceAround(source.text, hit.index, 180);
    const candidate =
      REQUIRED_CONTEXT.test(context) || REQUIRED_CONTEXT.test(source.text)
        ? 'required'
        : PREFERRED_CONTEXT.test(context) || PREFERRED_CONTEXT.test(source.text)
          ? 'preferred'
          : 'mentioned';

    if (STRENGTH_RANK[candidate] > STRENGTH_RANK[strength]) {
      strength = candidate;
    }
  }

  return strength;
}

function applyStrengthBoost(
  confidence: AiAgentConfidence,
  strength: AiAgentRequirementStrength,
  categories: AiAgentSignalCategory[],
): AiAgentConfidence {
  if (strength === 'required' && confidence === 'medium') return 'high';
  if (strength === 'preferred' && confidence === 'low') return 'medium';
  if (
    strength === 'required' &&
    confidence === 'low' &&
    !categories.includes('generic_ai_tooling')
  ) {
    return 'medium';
  }
  return confidence;
}

function highestConfidence(hits: MatchHit[]): AiAgentConfidence {
  return hits.reduce<AiAgentConfidence>(
    (highest, hit) =>
      CONFIDENCE_RANK[hit.confidence] > CONFIDENCE_RANK[highest] ? hit.confidence : highest,
    'low',
  );
}

function selectSnippets(sources: SourceText[], hits: MatchHit[]) {
  const sortedHits = [...hits].sort(
    (a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source] || a.index - b.index,
  );
  const snippets: AiAgentSignals['snippets'] = [];

  for (const hit of sortedHits) {
    const source = sources.find((item) => item.source === hit.source);
    if (!source) continue;

    const text = normalizeSnippet(sliceAround(source.text, hit.index, 160));
    if (snippets.some((snippet) => snippet.source === hit.source && snippet.text === text)) {
      continue;
    }
    snippets.push({ source: hit.source, text });
    if (snippets.length >= 3) break;
  }

  return snippets;
}

function nearMatch(text: string, index: number, pattern: RegExp): boolean {
  return pattern.test(sliceAround(text, index, 140));
}

function sliceAround(text: string, index: number, size: number): string {
  const half = Math.floor(size / 2);
  const start = Math.max(0, index - half);
  const end = Math.min(text.length, index + half);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function normalizeSnippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
