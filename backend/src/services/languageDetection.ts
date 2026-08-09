/**
 * Extension → language mapping.
 *
 * We keep two views:
 *   - `sourceLanguageOf(ext)`  → returns a *programming* language name, or null
 *                                for non-source files. Used to compute the
 *                                primary language of the repository.
 *   - `fileCategoryOf(ext)`    → returns a label for any file (source or not),
 *                                used for the aggregate language breakdown.
 *
 * Files like `package-lock.json` should not dominate primary-language detection,
 * so JSON/Markdown/YAML/etc. are intentionally excluded from `sourceLanguageOf`.
 */

const SOURCE_LANGUAGES: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  py: 'Python',
  java: 'Java',
  cpp: 'C++',
  cc: 'C++',
  cxx: 'C++',
  c: 'C',
  h: 'C',
  cs: 'C#',
  go: 'Go',
  rs: 'Rust',
  rb: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kt: 'Kotlin',
  kts: 'Kotlin',
  sh: 'Shell',
  bash: 'Shell',
  sql: 'SQL',
};

const NON_SOURCE_CATEGORIES: Record<string, string> = {
  html: 'HTML',
  css: 'CSS',
  scss: 'CSS',
  sass: 'CSS',
  json: 'JSON',
  md: 'Markdown',
  mdx: 'Markdown',
  yml: 'YAML',
  yaml: 'YAML',
};

/** Extract a lowercased extension (without dot) from a filename, or '' if none. */
export const extractExtension = (filename: string): string => {
  const idx = filename.lastIndexOf('.');
  if (idx <= 0 || idx === filename.length - 1) return '';
  return filename.slice(idx + 1).toLowerCase();
};

/** Programming-language classification (source files only). */
export const sourceLanguageOf = (extension: string): string | null => {
  return SOURCE_LANGUAGES[extension] ?? null;
};

/** Broad category for the aggregate breakdown (source + docs + assets). */
export const fileCategoryOf = (extension: string): string => {
  if (SOURCE_LANGUAGES[extension]) return SOURCE_LANGUAGES[extension];
  if (NON_SOURCE_CATEGORIES[extension]) return NON_SOURCE_CATEGORIES[extension];
  return 'Other';
};
