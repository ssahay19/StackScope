import { posix } from 'node:path';
import {
  expandSpecifierWithAliases,
  type PathAliasConfig,
} from './tsconfigPaths.js';

/**
 * importResolver
 *
 * Deterministic, filesystem-free resolution of `import` specifiers against
 * the set of files discovered by the scanner.
 *
 * Resolution order (Phase 5B):
 *   1. Relative specifiers (`./foo`, `../bar`) — unchanged from Phase 2.
 *   2. Path aliases from tsconfig/jsconfig `compilerOptions.paths`
 *      (e.g. `@/components/Button` → `src/components/Button`). Expanded
 *      candidates reuse the same extension / index-file inference.
 *   3. Otherwise external (`null`) — real bare packages like `react` stay
 *      unresolved.
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

/**
 * Resolve a repo-relative module path (already joined / alias-expanded) to a
 * scanned file, applying extension inference and index-file fallbacks.
 */
const resolveModulePath = (
  modulePath: string,
  opts: { targetsDirectory: boolean; hasExplicitExt: boolean },
  fileSet: Set<string>,
): string | null => {
  const joined = posix.normalize(modulePath).replace(/^\.\//, '');
  if (!joined || joined === '.' || joined.startsWith('../')) return null;

  let candidates: string[];
  if (opts.targetsDirectory) {
    const trimmed = joined.replace(/\/+$/, '');
    candidates = INDEX_FILES.map((idx) => posix.join(trimmed, idx));
  } else if (opts.hasExplicitExt) {
    candidates = [joined, ...swapJsForTs(joined)];
  } else {
    candidates = candidatesFor(joined, false);
  }

  return firstExisting(candidates, fileSet);
};

export interface ImportResolver {
  resolve(fromFile: string, specifier: string): string | null;
}

export interface CreateImportResolverOptions {
  /** Optional Phase 5B path-alias map loaded from tsconfig/jsconfig. */
  aliases?: PathAliasConfig | null;
}

export const createImportResolver = (
  allFilePaths: readonly string[],
  options: CreateImportResolverOptions = {},
): ImportResolver => {
  const fileSet = new Set(allFilePaths);
  const aliases = options.aliases ?? null;

  return {
    resolve(fromFile: string, specifier: string): string | null {
      if (!specifier) return null;

      // 1. Relative imports — original Phase 2 behavior.
      if (isRelative(specifier)) {
        const fromDir = posix.dirname(fromFile);
        const joined = posix.normalize(posix.join(fromDir, specifier));
        const targetsDirectory = specifier.endsWith('/');
        const hasExplicitExt = !targetsDirectory && EXPLICIT_EXT_PATTERN.test(specifier);
        return resolveModulePath(joined, { targetsDirectory, hasExplicitExt }, fileSet);
      }

      // 2. Path aliases from tsconfig/jsconfig (Phase 5B).
      const expanded = expandSpecifierWithAliases(specifier, aliases);
      for (const candidate of expanded) {
        const targetsDirectory = candidate.endsWith('/') || specifier.endsWith('/');
        const hasExplicitExt =
          !targetsDirectory && EXPLICIT_EXT_PATTERN.test(candidate);
        const hit = resolveModulePath(
          candidate,
          { targetsDirectory, hasExplicitExt },
          fileSet,
        );
        if (hit) return hit;
      }

      // 3. Bare packages and anything else → external.
      return null;
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
