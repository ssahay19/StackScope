/**
 * Thin LLM provider interface (Phase 6).
 * One method — keep providers swappable without touching the summary service.
 */

export interface LlmProvider {
  readonly name: string;
  generate(prompt: string): Promise<string>;
}
