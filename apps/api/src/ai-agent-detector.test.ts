import { describe, expect, test } from 'bun:test';
import { detectAiAgentSignals } from './ai-agent-detector.ts';

describe('detectAiAgentSignals', () => {
  test('detects named coding-agent tools case-insensitively', () => {
    const signals = detectAiAgentSignals({
      title: 'Software Engineer',
      requirementsText:
        'Required experience using claude code, Cursor, and OpenCode.',
      descriptionText: null,
    });

    expect(signals.detected).toBe(true);
    expect(signals.confidence).toBe('high');
    expect(signals.requirementStrength).toBe('required');
    expect(signals.tools).toContain('Claude Code');
    expect(signals.tools).toContain('Cursor');
    expect(signals.tools).toContain('OpenCode');
    expect(signals.categories).toContain('tool');
    expect(signals.snippets[0]?.source).toBe('requirements');
  });

  test('does not detect bare Codex', () => {
    const signals = detectAiAgentSignals({
      title: 'Codex Platform Engineer',
      requirementsText: 'Maintain an internal codex of service patterns.',
      descriptionText: null,
    });

    expect(signals.detected).toBe(false);
  });

  test('detects contextual Codex', () => {
    const signals = detectAiAgentSignals({
      title: 'Backend Engineer',
      requirementsText: 'Experience with OpenAI Codex or Codex CLI required.',
      descriptionText: null,
    });

    expect(signals.detected).toBe(true);
    expect(signals.confidence).toBe('high');
    expect(signals.tools).toContain('OpenAI Codex');
  });

  test('detects bare Claude as low generic tooling', () => {
    const signals = detectAiAgentSignals({
      title: null,
      requirementsText: null,
      descriptionText: 'We use Claude for internal workflows.',
    });

    expect(signals.detected).toBe(true);
    expect(signals.confidence).toBe('low');
    expect(signals.tools).toEqual(['Claude']);
    expect(signals.categories).toEqual(['generic_ai_tooling']);
  });

  test('requires dev context for non-tool agentic phrases', () => {
    const supportSignals = detectAiAgentSignals({
      title: 'AI Agent Product Manager',
      requirementsText: 'Build customer support AI agents for sales teams.',
      descriptionText: null,
    });
    const codingSignals = detectAiAgentSignals({
      title: 'Software Engineer',
      requirementsText:
        'Build AI-assisted development workflows and agentic coding systems.',
      descriptionText: null,
    });

    expect(supportSignals.detected).toBe(false);
    expect(codingSignals.detected).toBe(true);
    expect(codingSignals.categories).toContain('agentic_workflow');
  });

  test('guards ambiguous Continue and mouse cursor mentions', () => {
    const plainSignals = detectAiAgentSignals({
      title: null,
      requirementsText:
        'Continue improving onboarding and mouse cursor states.',
      descriptionText: null,
    });
    const toolSignals = detectAiAgentSignals({
      title: null,
      requirementsText: 'Use Continue in IDE coding workflows.',
      descriptionText: null,
    });

    expect(plainSignals.tools).not.toContain('Cursor');
    expect(toolSignals.detected).toBe(true);
    expect(toolSignals.tools).toContain('Continue');
  });

  test('boosts confidence with requirement strength', () => {
    const signals = detectAiAgentSignals({
      title: 'Software Engineer',
      requirementsText:
        'Required experience with AI-assisted development in TypeScript.',
      descriptionText: null,
    });

    expect(signals.requirementStrength).toBe('required');
    expect(signals.confidence).toBe('high');
  });
});
