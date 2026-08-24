import { env } from '../../config/env.js';
import type { LlmProvider } from './llmProvider.js';
import { OpenAiProvider } from './openaiProvider.js';

/** True when an API key is present so AI summaries can run. */
export const isLlmConfigured = (): boolean => env.llmApiKey.trim().length > 0;

/**
 * Build the concrete provider from env, or `null` when AI is unavailable.
 */
export const createLlmProviderFromEnv = (): LlmProvider | null => {
  if (!isLlmConfigured()) return null;
  const provider = env.llmProvider.trim().toLowerCase() || 'openai';
  if (provider === 'openai') {
    return new OpenAiProvider({
      apiKey: env.llmApiKey.trim(),
      model: env.llmModel,
      timeoutMs: env.llmTimeoutMs,
    });
  }
  // Unknown provider name with a key still configured → treat as unavailable
  // rather than half-implementing another backend.
  return null;
};
