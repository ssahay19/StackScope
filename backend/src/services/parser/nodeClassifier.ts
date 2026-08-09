import { posix } from 'node:path';

/**
 * nodeClassifier — deterministic file classification for graph visualization.
 *
 * Pure functions of (filePath, extension). Two outputs:
 *   - category: 'source' | 'test' | 'config' | 'documentation' | 'data' | 'style' | 'other'
 *   - folder:   parent folder path (or '' for repository root)
 *
 * Test / config detection is filename-pattern based. The frontend uses
 * category (combined with language) to pick node colors.
 */

export type NodeCategory =
  | 'source'
  | 'test'
  | 'config'
  | 'documentation'
  | 'data'
  | 'style'
  | 'other';

/** Filename basenames that always indicate configuration. */
const CONFIG_BASENAMES = new Set<string>([
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  '.babelrc',
  '.babelrc.js',
  '.babelrc.cjs',
  '.babelrc.json',
  '.editorconfig',
  '.gitignore',
  '.gitattributes',
  '.npmrc',
  '.nvmrc',
  '.env',
  '.dockerignore',
  'Dockerfile',
  'Makefile',
  'LICENSE',
]);

/** Filename prefixes → config. e.g. `tsconfig.build.json`. */
const CONFIG_PREFIXES = [
  'tsconfig',
  'jsconfig',
  'vite.config',
  'vitest.config',
  'webpack.config',
  'rollup.config',
  'esbuild.config',
  'turbo.json',
  'nx.json',
  'jest.config',
  'babel.config',
  'postcss.config',
  'tailwind.config',
  'next.config',
  'nuxt.config',
  'svelte.config',
  'astro.config',
  'remix.config',
];

const TEST_EXTENSION_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/i;
const TEST_PATH_SEGMENTS = new Set(['__tests__', 'test', 'tests', '__test__', 'spec']);

const DOC_EXTENSIONS = new Set(['md', 'mdx', 'rst', 'txt']);
const DATA_EXTENSIONS = new Set(['json', 'yml', 'yaml', 'toml', 'xml', 'ini']);
const STYLE_EXTENSIONS = new Set(['css', 'scss', 'sass', 'less']);
const SOURCE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'mts',
  'cts',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'go',
  'rs',
  'rb',
  'java',
  'kt',
  'swift',
  'c',
  'cc',
  'cpp',
  'cxx',
  'h',
  'hpp',
  'php',
  'cs',
  'sh',
  'bash',
  'sql',
  'vue',
  'svelte',
  'html',
]);

const isTestFile = (filePath: string): boolean => {
  const base = posix.basename(filePath);
  if (TEST_EXTENSION_PATTERN.test(base)) return true;
  // Any segment of the path is a known test directory.
  for (const seg of filePath.split('/')) {
    if (TEST_PATH_SEGMENTS.has(seg)) return true;
  }
  return false;
};

const isConfigFile = (filePath: string): boolean => {
  const base = posix.basename(filePath);
  if (CONFIG_BASENAMES.has(base)) return true;
  for (const prefix of CONFIG_PREFIXES) {
    if (base === prefix || base.startsWith(`${prefix}.`)) return true;
  }
  // Dotfiles that look like tool configs at the repo root, e.g. `.prettierrc.foo`.
  if (base.startsWith('.') && base.includes('rc')) return true;
  return false;
};

export const classifyFile = (filePath: string, extension: string | null): NodeCategory => {
  const ext = extension?.toLowerCase() ?? null;

  // Test detection wins over everything except explicit config (rare overlap).
  if (isTestFile(filePath)) return 'test';
  if (isConfigFile(filePath)) return 'config';
  if (ext && DOC_EXTENSIONS.has(ext)) return 'documentation';
  if (ext && DATA_EXTENSIONS.has(ext)) return 'data';
  if (ext && STYLE_EXTENSIONS.has(ext)) return 'style';
  if (ext && SOURCE_EXTENSIONS.has(ext)) return 'source';
  return 'other';
};

export const folderOf = (filePath: string): string => {
  const dir = posix.dirname(filePath);
  return dir === '.' || dir === '/' ? '' : dir;
};
