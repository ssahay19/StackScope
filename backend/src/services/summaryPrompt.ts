import type { ArchitectureInsights } from './architectureInsightsService.js';
import type { LanguageStat } from '../types/repository.js';

/** Bump when the prompt template or fact selection changes. */
export const PROMPT_VERSION = 'v1';

export interface ArchitecturePromptInput {
  owner: string;
  name: string;
  primaryLanguage: string;
  languages: LanguageStat[];
  insights: ArchitectureInsights;
  readmeExcerpt: string | null;
}

const TOP_N = 8;
const MAX_CHAINS = 5;
const MAX_CHAIN_FILES = 6;
const MAX_GROUPS = 10;
const MAX_LANGUAGES = 8;
const MAX_README_CHARS = 1_200;

/**
 * Build a bounded, structured prompt from analysis facts — no source code.
 */
export const buildArchitecturePrompt = (input: ArchitecturePromptInput): string => {
  const { insights } = input;
  const s = insights.summary;

  const lines: string[] = [];
  lines.push(`Repository: ${input.owner}/${input.name}`);
  lines.push(`Primary language: ${input.primaryLanguage}`);
  lines.push('');
  lines.push('Language breakdown:');
  for (const lang of input.languages.slice(0, MAX_LANGUAGES)) {
    lines.push(`- ${lang.name}: ${lang.fileCount} files (${lang.percent}%)`);
  }
  lines.push('');
  lines.push('Architecture health summary:');
  lines.push(
    `- ${s.totalFiles} parsed files, ${s.totalDependencies} dependency edges`,
  );
  lines.push(
    `- ${s.circularChainCount} circular dependency chains, ${s.rootCount} entry points (roots), ${s.orphanCount} orphans`,
  );
  lines.push(`- Dependency depth (cycle-collapsed DAG): ${insights.dependencyDepth.maxDepth}`);
  if (insights.dependencyDepth.deepestPath.length > 0) {
    lines.push(
      `- Deepest path: ${insights.dependencyDepth.deepestPath.slice(0, 12).join(' → ')}`,
    );
  }
  lines.push('');

  lines.push('Most depended-on files:');
  appendList(
    lines,
    insights.mostDependedOn.slice(0, TOP_N).map((r) => `${r.filePath} (${r.dependents} dependents)`),
  );

  lines.push('Hub files (high total degree):');
  appendList(
    lines,
    insights.hubs
      .slice(0, TOP_N)
      .map((h) => `${h.filePath} (degree ${h.totalDegree}: in ${h.inDegree}, out ${h.outDegree})`),
  );

  lines.push('Entry points (in-degree 0, not config/test):');
  appendList(
    lines,
    insights.entryPoints.slice(0, TOP_N).map((e) => `${e.filePath} (out ${e.outDegree})`),
  );

  lines.push('Orphan files (in=0 and out=0 among parsed nodes):');
  appendList(
    lines,
    insights.orphans.slice(0, TOP_N).map((o) => `${o.filePath} [${o.category}/${o.language}]`),
  );

  lines.push('Circular dependency chains:');
  if (insights.circularChains.length === 0) {
    lines.push('- (none)');
  } else {
    for (const chain of insights.circularChains.slice(0, MAX_CHAINS)) {
      const files = chain.files.slice(0, MAX_CHAIN_FILES);
      const suffix = chain.files.length > MAX_CHAIN_FILES ? ' → …' : '';
      lines.push(`- ${files.join(' → ')}${suffix}`);
    }
  }
  lines.push('');

  lines.push('Module groups by top-level folder (not community detection):');
  for (const g of insights.moduleGroups.slice(0, MAX_GROUPS)) {
    const folder = g.folder || '(root)';
    lines.push(
      `- ${folder}: ${g.fileCount} files, ${g.internalEdges} internal edges, ${g.outboundCrossEdges} outbound / ${g.inboundCrossEdges} inbound cross-folder`,
    );
  }

  const readme = truncate(input.readmeExcerpt?.trim() ?? '', MAX_README_CHARS);
  if (readme.length > 0) {
    lines.push('');
    lines.push('README excerpt (may be truncated):');
    lines.push(readme);
  }

  lines.push('');
  lines.push('Task: Write a concise architecture overview (3–6 short paragraphs).');
  lines.push(
    'Cover: what the repo appears to be, how top-level folders relate, notable hubs / shared utilities, entry points, and any circular dependencies or orphans worth mentioning.',
  );
  lines.push('Use only the facts above. Do not invent modules or claim features not evidenced here.');

  return lines.join('\n');
};

/** Rough char-based budget check helper for tests / logging. */
export const estimatePromptChars = (prompt: string): number => prompt.length;

const appendList = (lines: string[], items: string[]): void => {
  if (items.length === 0) {
    lines.push('- (none)');
  } else {
    for (const item of items) lines.push(`- ${item}`);
  }
  lines.push('');
};

const truncate = (text: string, max: number): string => {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
};
