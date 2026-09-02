import { analysisStore } from './analysisService.js';
import { computeArchitectureInsights } from './architectureInsightsService.js';
import {
  buildArchitecturePrompt,
  estimatePromptChars,
  PROMPT_VERSION,
} from './summaryPrompt.js';
import { createLlmProviderFromEnv, isLlmConfigured } from './llm/createProvider.js';
import type { LlmProvider } from './llm/llmProvider.js';
import type { CachedAiSummary } from './analysisStore.js';
import { AiFailedError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ service: 'summaryService' });

export type SummaryResponse =
  | {
      status: 'unavailable';
      code: 'AI_NOT_CONFIGURED';
      message: string;
    }
  | {
      status: 'ok';
      text: string;
      cached: boolean;
      promptVersion: string;
      provider: string;
      generatedAt: string;
      promptChars: number;
    };

/** Test seam — when set (including `null`), overrides env-based provider. */
let providerOverride: LlmProvider | null | undefined;

export const setLlmProviderForTests = (provider: LlmProvider | null | undefined): void => {
  providerOverride = provider;
};

export const resolveLlmProvider = (): LlmProvider | null => {
  if (providerOverride !== undefined) return providerOverride;
  return createLlmProviderFromEnv();
};

/** In-flight dedupe so concurrent GETs share one provider call. */
const inflight = new Map<string, Promise<SummaryResponse>>();

/**
 * Opt-in architecture overview for a stored analysis.
 * Never called from the default analyze path.
 */
export const summarizeRepository = async (id: string): Promise<SummaryResponse> => {
  const provider = resolveLlmProvider();
  if (!provider) {
    return {
      status: 'unavailable',
      code: 'AI_NOT_CONFIGURED',
      message:
        'AI architecture overviews are not configured. Set LLM_API_KEY (and optionally LLM_PROVIDER / LLM_MODEL) on the server.',
    };
  }

  const cacheKey = `${id}:${PROMPT_VERSION}`;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const run = generateOrLoad(id, provider).finally(() => {
    inflight.delete(cacheKey);
  });
  inflight.set(cacheKey, run);
  return run;
};

const generateOrLoad = async (
  id: string,
  provider: LlmProvider,
): Promise<SummaryResponse> => {
  const record = analysisStore.get(id);
  const cached = record.aiSummaries[PROMPT_VERSION];
  if (cached) {
    return {
      status: 'ok',
      text: cached.text,
      cached: true,
      promptVersion: cached.promptVersion,
      provider: cached.provider,
      generatedAt: cached.generatedAt,
      promptChars: 0,
    };
  }

  const insights = computeArchitectureInsights(record.graph);
  const prompt = buildArchitecturePrompt({
    owner: record.analysis.owner,
    name: record.analysis.name,
    primaryLanguage: record.analysis.language,
    languages: record.analysis.languages,
    insights,
    readmeExcerpt: record.readmeExcerpt,
  });
  const promptChars = estimatePromptChars(prompt);
  log.info(
    { id, promptVersion: PROMPT_VERSION, promptChars, provider: provider.name },
    'generating architecture summary',
  );

  const text = await provider.generate(prompt);
  if (!text || text.trim().length < 40) {
    throw new AiFailedError('The AI provider returned an empty or unusable response.');
  }

  const entry: CachedAiSummary = {
    text: text.trim(),
    generatedAt: new Date().toISOString(),
    provider: provider.name,
    promptVersion: PROMPT_VERSION,
  };
  analysisStore.saveAiSummary(id, PROMPT_VERSION, entry);

  return {
    status: 'ok',
    text: entry.text,
    cached: false,
    promptVersion: entry.promptVersion,
    provider: entry.provider,
    generatedAt: entry.generatedAt,
    promptChars,
  };
};

/** Exported for tests / route docs. */
export { PROMPT_VERSION, buildArchitecturePrompt, isLlmConfigured };
