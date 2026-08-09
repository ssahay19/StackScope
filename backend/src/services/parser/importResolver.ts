import { posix } from 'node:path';

/**
 * importResolver
 *
 * Deterministic, filesystem-free resolution of `import` specifiers against
 * the set of files discovered by the scanner. We resolve *only* relative
 * specifiers (`./foo`, `../bar`). Bare specifiers (`react`), path aliases
 * (`@/foo`), and absolute paths are treated as external and left unresolved
 * — that's honest and matches what a static analyzer without a tsconfig
 * mapping can be sure of.
 *
 * The resolver is passed the full list of repo-relative POSIX paths and
 * returns a resolver function bound to that set.
 */

const CANDIDATE_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'] as const;
const INDEX_FILES = CANDIDATE_EXTENSIONS.map((ext) => `index.${ext}`);

const isRelative = (specifier: string): boolean =>
  specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.' || specifier === '..';

/**
 * Try each candidate path in order; return the first one that exists.
 * We do NOT reorder by preference beyond what CANDIDATE_EXTENSIONS defines
 * (TS before JS) — resolution is deterministic and reproducible.
 */
const firstExisting = (candidates: string[], fileSet: Set<string>): string | null => {
  for (const c of candidates) {
    if (fileSet.has(c)) return c;
  }
  return null;
};

/**
 * Given a bare joined path like `src/foo`, produce the list of candidate paths
 * we'd try (extensions and index files).
 */
const candidatesFor = (basePath: string, hasExplicitExtension: boolean): string[] => {
  if (hasExplicitExtension) {
    return [basePath];
  }
  const withExt = CANDIDATE_EXTENSIONS.map((ext) => `${basePath}.${ext}`);
  const asIndex = INDEX_FILES.map((idx) => posix.join(basePath, idx));
  return [...withExt, ...asIndex];
};

const EXPLICIT_EXT_PATTERN = /\.[a-zA-Z0-9]{1,6}$/;

export interface ImportResolver {
  resolve(fromFile: string, specifier: string): string | null;
}

export const createImportResolver = (allFilePaths: readonly string[]): ImportResolver => {
  const fileSet = new Set(allFilePaths);

  return {
    resolve(fromFile: string, specifier: string): string | null {
      if (!isRelative(specifier)) return null;

      const fromDir = posix.dirname(fromFile);
      // posix.join handles `./`, `../`, and strips redundant segments.
      const joined = posix.normalize(posix.join(fromDir, specifier));

      // A specifier ending in `/` explicitly targets a directory index.
      const targetsDirectory = specifier.endsWith('/');
      const hasExplicitExt = !targetsDirectory && EXPLICIT_EXT_PATTERN.test(specifier);

      let candidates: string[];
      if (targetsDirectory) {
        // Strip trailing slash for join, then resolve index files.
        const trimmed = joined.replace(/\/+$/, '');
        candidates = INDEX_FILES.map((idx) => posix.join(trimmed, idx));
      } else if (hasExplicitExt) {
        // Handle `./foo.js` — most projects mean `./foo.ts` under TS. Try both.
        candidates = [joined, ...swapJsForTs(joined)];
      } else {
        candidates = candidatesFor(joined, false);
      }

      return firstExisting(candidates, fileSet);
    },
  };
};

/**
 * For an explicit `.js`/`.jsx`/`.mjs`/`.cjs` specifier, produce fallback
 * candidates with the TS equivalent extension. This is the standard NodeNext
 * behavior under `--moduleResolution NodeNext` — TS code often writes `.js`
 * but the file on disk is `.ts`.
 */
const swapJsForTs = (path: string): string[] => {
  const out: string[] = [];
  const map: Record<string, string[]> = {
    '.js': ['.ts', '.tsx'],
    '.jsx': ['.tsx'],
    '.mjs': ['.mts'],
    '.cjs': ['.cts'],
  };
  for (const [jsExt, tsExts] of Object.entries(map)) {
    if (path.endsWith(jsExt)) {
      const base = path.slice(0, -jsExt.length);
      for (const t of tsExts) out.push(base + t);
    }
  }
  return out;
};
