/**
 * Phase 6 — AI architecture overview response shapes.
 */

export type RepositorySummaryResponse =
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
