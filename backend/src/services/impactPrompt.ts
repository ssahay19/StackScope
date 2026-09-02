import type { FileImpact } from './impactService.js';
import type { CodeSymbol, NodeCategory } from '../types/parsing.js';
import { estimatePromptChars } from './summaryPrompt.js';

/** Bump when the impact explanation prompt template changes. */
export const IMPACT_PROMPT_VERSION = 'impact-v1';

export interface ImpactPromptInput {
  owner: string;
  name: string;
  filePath: string;
  language: string;
  category: NodeCategory;
  symbols: CodeSymbol[];
  impact: FileImpact;
}

const TOP_N = 12;
const MAX_SYMBOLS = 20;

/**
 * Bounded prompt from structured impact facts + symbol names — no source code.
 */
export const buildImpactPrompt = (input: ImpactPromptInput): string => {
  const { impact } = input;
  const down = impact.downstream;
  const up = impact.upstream;

  const lines: string[] = [];
  lines.push(`Repository: ${input.owner}/${input.name}`);
  lines.push(`Target file: ${input.filePath}`);
  lines.push(`Language: ${input.language} · category: ${input.category}`);
  lines.push('');

  lines.push('Change-impact summary (if this file changes):');
  lines.push(
    `- Downstream (affected): ${down.total} files — ${down.directCount} direct, ${down.transitiveCount} transitive; max distance ${down.maxDistance}`,
  );
  lines.push(
    `- Upstream (depends on): ${up.total} files — ${up.directCount} direct, ${up.transitiveCount} transitive; max distance ${up.maxDistance}`,
  );
  lines.push('');

  lines.push('Direct importers (distance 1):');
  appendPaths(
    lines,
    down.files.filter((f) => f.relation === 'direct').slice(0, TOP_N).map((f) => f.filePath),
  );

  lines.push('Transitive dependents (sample, by distance):');
  appendPaths(
    lines,
    down.files
      .filter((f) => f.relation === 'transitive')
      .slice(0, TOP_N)
      .map((f) => `${f.filePath} (distance ${f.distance})`),
  );

  lines.push('Direct dependencies (what this file imports):');
  appendPaths(
    lines,
    up.files.filter((f) => f.relation === 'direct').slice(0, TOP_N).map((f) => f.filePath),
  );

  const modulesTouched = moduleFolders(down.files.map((f) => f.filePath));
  lines.push('Top-level modules touched by downstream impact:');
  if (modulesTouched.length === 0) {
    lines.push('- (none)');
  } else {
    for (const [folder, count] of modulesTouched.slice(0, 10)) {
      lines.push(`- ${folder || '(root)'}: ${count} affected files`);
    }
  }
  lines.push('');

  const symbolNames = input.symbols
    .filter((s) => s.exported)
    .slice(0, MAX_SYMBOLS)
    .map((s) => `${s.name} (${s.kind})`);
  lines.push('Exported symbols (names only):');
  appendPaths(lines, symbolNames);

  lines.push('Task: Write a concise change-impact explanation (2–4 short paragraphs).');
  lines.push(
    'Cover: what role this file appears to play, how large the blast radius is, which modules would feel a change most, and any caution about shared APIs if the counts are high.',
  );
  lines.push('Use only the facts above. Do not invent files, symbols, or dependents.');

  return lines.join('\n');
};

export const estimateImpactPromptChars = (prompt: string): number => estimatePromptChars(prompt);

/** Cache key inside `aiSummaries` for a per-file impact explanation. */
export const impactCacheKey = (filePath: string): string =>
  `${IMPACT_PROMPT_VERSION}:${filePath}`;

const appendPaths = (lines: string[], items: string[]): void => {
  if (items.length === 0) {
    lines.push('- (none)');
  } else {
    for (const item of items) lines.push(`- ${item}`);
  }
  lines.push('');
};

const moduleFolders = (paths: string[]): Array<[string, number]> => {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const idx = p.indexOf('/');
    const folder = idx === -1 ? '' : p.slice(0, idx);
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};
