import type { DependencyNode, NodeCategory } from '../types/parsing';

/**
 * Deterministic color mapping used by the graph, the legend, and the side
 * panel. Colors are HSL-ish tokens picked to remain legible on the dark
 * surface and to survive dimming/highlight states.
 *
 * Category is the primary axis. When the category is `source`, we fall back
 * to the language name so TypeScript and JavaScript source files get their
 * own colors as required by the spec.
 */

export interface NodeColorTokens {
  /** Category or language identifier used for the legend row. */
  key: string;
  label: string;
  /** Solid stroke / accent color. */
  ring: string;
  /** Fill for the node body — a translucent version of `ring`. */
  fill: string;
  /** Text color that pairs with the fill. */
  text: string;
  /** A darker/dimmer variant used for the icon or extension chip. */
  chip: string;
}

const TOKENS = {
  typescript: {
    key: 'typescript',
    label: 'TypeScript',
    ring: '#3b82f6',
    fill: 'rgba(59, 130, 246, 0.14)',
    text: '#dbeafe',
    chip: 'rgba(59, 130, 246, 0.28)',
  },
  javascript: {
    key: 'javascript',
    label: 'JavaScript',
    ring: '#eab308',
    fill: 'rgba(234, 179, 8, 0.14)',
    text: '#fef3c7',
    chip: 'rgba(234, 179, 8, 0.28)',
  },
  data: {
    key: 'data',
    label: 'JSON / Data',
    ring: '#22c55e',
    fill: 'rgba(34, 197, 94, 0.14)',
    text: '#dcfce7',
    chip: 'rgba(34, 197, 94, 0.28)',
  },
  documentation: {
    key: 'documentation',
    label: 'Markdown / Docs',
    ring: '#94a3b8',
    fill: 'rgba(148, 163, 184, 0.14)',
    text: '#e2e8f0',
    chip: 'rgba(148, 163, 184, 0.28)',
  },
  config: {
    key: 'config',
    label: 'Configuration',
    ring: '#a855f7',
    fill: 'rgba(168, 85, 247, 0.14)',
    text: '#f3e8ff',
    chip: 'rgba(168, 85, 247, 0.28)',
  },
  test: {
    key: 'test',
    label: 'Tests',
    ring: '#f97316',
    fill: 'rgba(249, 115, 22, 0.14)',
    text: '#fed7aa',
    chip: 'rgba(249, 115, 22, 0.28)',
  },
  style: {
    key: 'style',
    label: 'Styles',
    ring: '#ec4899',
    fill: 'rgba(236, 72, 153, 0.14)',
    text: '#fce7f3',
    chip: 'rgba(236, 72, 153, 0.28)',
  },
  other: {
    key: 'other',
    label: 'Other',
    ring: '#64748b',
    fill: 'rgba(100, 116, 139, 0.14)',
    text: '#e2e8f0',
    chip: 'rgba(100, 116, 139, 0.28)',
  },
} satisfies Record<string, NodeColorTokens>;

/**
 * Pick a color for a node.
 *
 *   category === 'test'          → orange
 *   category === 'config'        → purple
 *   category === 'documentation' → gray
 *   category === 'data'          → green
 *   category === 'style'         → pink
 *   category === 'source'        → language-specific (TS blue, JS yellow, …)
 *   otherwise                    → other (neutral)
 *
 * This exact order is asserted in `graphColors.test.ts`.
 */
export const colorForNode = (node: Pick<DependencyNode, 'category' | 'language'>): NodeColorTokens => {
  if (node.category === 'test') return TOKENS.test;
  if (node.category === 'config') return TOKENS.config;
  if (node.category === 'documentation') return TOKENS.documentation;
  if (node.category === 'data') return TOKENS.data;
  if (node.category === 'style') return TOKENS.style;

  if (node.category === 'source') {
    const lang = node.language.toLowerCase();
    if (lang === 'typescript' || lang.startsWith('typescript')) return TOKENS.typescript;
    if (lang === 'javascript' || lang.startsWith('javascript')) return TOKENS.javascript;
  }
  return TOKENS.other;
};

/** The ordered list of legend entries the UI should render. */
export const LEGEND_ORDER: NodeColorTokens[] = [
  TOKENS.typescript,
  TOKENS.javascript,
  TOKENS.data,
  TOKENS.documentation,
  TOKENS.config,
  TOKENS.test,
  TOKENS.style,
  TOKENS.other,
];

export const CATEGORY_LABEL: Record<NodeCategory, string> = {
  source: 'Source',
  test: 'Tests',
  config: 'Configuration',
  documentation: 'Documentation',
  data: 'Data',
  style: 'Styles',
  other: 'Other',
};
