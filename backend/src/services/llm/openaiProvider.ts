import {
  AiFailedError,
  AiRateLimitedError,
  AiTimeoutError,
} from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { LlmProvider } from './llmProvider.js';

const log = logger.child({ service: 'openaiProvider' });

export interface OpenAiProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/**
 * OpenAI Chat Completions provider — the sole concrete LLM backend for Phase 6.
 */
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: OpenAiProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
  }

  async generate(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.3,
          max_tokens: 900,
          messages: [
            {
              role: 'system',
              content:
                'You are a senior software architect. Explain repository architecture clearly and concretely using only the structured facts provided. Do not invent files, modules, or dependencies that are not listed. Prefer short paragraphs over bullet spam. No marketing language.',
            },
            { role: 'user', content: prompt },
          ],
        }),
        signal: controller.signal,
      });

      if (response.status === 429) {
        throw new AiRateLimitedError();
      }
      if (!response.ok) {
        const detail = await safeText(response);
        log.warn({ status: response.status, detail: detail.slice(0, 200) }, 'openai request failed');
        throw new AiFailedError('The AI provider returned an error.');
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const text = body.choices?.[0]?.message?.content?.trim() ?? '';
      if (text.length < 40) {
        throw new AiFailedError('The AI provider returned an empty or unusable response.');
      }
      return text;
    } catch (err) {
      if (err instanceof AiRateLimitedError || err instanceof AiFailedError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AiTimeoutError(undefined, err);
      }
      throw new AiFailedError('Failed to reach the AI provider.', err);
    } finally {
      clearTimeout(timer);
    }
  }
}

const safeText = async (res: Response): Promise<string> => {
  try {
    return await res.text();
  } catch {
    return '';
  }
};
