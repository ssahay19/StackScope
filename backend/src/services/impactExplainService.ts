import { analysisStore } from './analysisService.js';
import { computeImpact } from './impactService.js';
import {
  buildImpactPrompt,
  estimateImpactPromptChars,
  impactCacheKey,
  IMPACT_PROMPT_VERSION,
} from './impactPrompt.js';
import type { CachedAiSummary } from './analysisStore.js';
import { resolveLlmProvider, type SummaryResponse } from './summaryService.js';
import { AiFailedError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ service: 'impactExplainService' });

const inflight = new Map<string, Promise<SummaryResponse>>();

/**
 * Opt-in per-file impact explanation. Never called from analyze.
 * Cached by (analysisId, filePath, IMPACT_PROMPT_VERSION).
 */
export const explainFileImpact = async (
  id: string,
  filePath: string,
): Promise<SummaryResponse> => {
  const provider = resolveLlmProvider();
  if (!provider) {
    return {
      status: 'unavailable',
      code: 'AI_NOT_CONFIGURED',
      message:
        'AI impact explanations are not configured. Set LLM_API_KEY (and optionally LLM_PROVIDER / LLM_MODEL) on the server.',
    };
  }

  const cacheKey = `${id}:${impactCacheKey(filePath)}`;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const run = generateOrLoad(id, filePath, provider).finally(() => {
    inflight.delete(cacheKey);
  });
  inflight.set(cacheKey, run);
  return run;
};

const generateOrLoad = async (
  id: string,
  filePath: string,
  provider: { name: string; generate: (prompt: string) => Promise<string> },
): Promise<SummaryResponse> => {
  const record = analysisStore.get(id);
  const key = impactCacheKey(filePath);
  const cached = record.aiSummaries[key];
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

  const impact = computeImpact(record.graph, filePath);
  if (!impact) throw new NotFoundError('File not found in this repository analysis.');

  const node = record.graph.nodes.find((n) => n.filePath === filePath);
  if (!node) throw new NotFoundError('File not found in this repository analysis.');

  const prompt = buildImpactPrompt({
    owner: record.analysis.owner,
    name: record.analysis.name,
    filePath,
    language: node.language,
    category: node.category,
    symbols: node.symbols,
    impact,
  });
  const promptChars = estimateImpactPromptChars(prompt);
  log.info(
    { id, filePath, promptVersion: IMPACT_PROMPT_VERSION, promptChars, provider: provider.name },
    'generating impact explanation',
  );

  const text = await provider.generate(prompt);
  if (!text || text.trim().length < 40) {
    throw new AiFailedError('The AI provider returned an empty or unusable response.');
  }

  const entry: CachedAiSummary = {
    text: text.trim(),
    generatedAt: new Date().toISOString(),
    provider: provider.name,
    promptVersion: IMPACT_PROMPT_VERSION,
  };
  analysisStore.saveAiSummary(id, key, entry);

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

export { IMPACT_PROMPT_VERSION, buildImpactPrompt, impactCacheKey };
