import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const README_CANDIDATES = ['README.md', 'README.MD', 'readme.md', 'README', 'Readme.md'] as const;
const DEFAULT_MAX_CHARS = 1_500;

/**
 * Best-effort README excerpt from a cloned working tree (analyze-time only).
 */
export const readReadmeExcerpt = async (
  clonedRoot: string,
  maxChars = DEFAULT_MAX_CHARS,
): Promise<string | null> => {
  for (const name of README_CANDIDATES) {
    try {
      const raw = await readFile(join(clonedRoot, name), 'utf8');
      const trimmed = raw.trim();
      if (trimmed.length === 0) continue;
      if (trimmed.length <= maxChars) return trimmed;
      return `${trimmed.slice(0, maxChars)}…`;
    } catch {
      // try next candidate
    }
  }
  return null;
};
