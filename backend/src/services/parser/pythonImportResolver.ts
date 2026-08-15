import { posix } from 'node:path';

/**
 * pythonImportResolver — Phase 5A
 *
 * Resolves Python import module specifiers against the scanned repo file set.
 * This is intentionally separate from the JS/TS `importResolver`: Python uses
 * dotted module paths and package `__init__.py` conventions, not relative
 * file-path candidates.
 *
 * Supported:
 *   - Absolute: `a.b.c` → `a/b/c.py` or `a/b/c/__init__.py` (repo-root based)
 *   - Relative: `.`, `..`, `.foo`, `..pkg.sub` resolved against the importing
 *     file's package directory (dirname of the file)
 *
 * Not supported (left unresolved / external):
 *   - stdlib and pip packages (no match in the file set)
 *   - namespace packages without `__init__.py`
 *   - `sys.path` manipulation / src-layout path hacks
 */

export interface PythonImportResolver {
  resolve(fromFile: string, specifier: string): string | null;
}

const firstExisting = (candidates: string[], fileSet: Set<string>): string | null => {
  for (const c of candidates) {
    if (fileSet.has(c)) return c;
  }
  return null;
};

/** Module path segments → file candidates (module.py or package/__init__.py). */
const candidatesForModulePath = (modulePath: string): string[] => {
  if (!modulePath || modulePath === '.') {
    // Caller should pass a concrete directory for package roots.
    return [];
  }
  const normalized = modulePath.replace(/\/+$/, '');
  return [`${normalized}.py`, posix.join(normalized, '__init__.py')];
};

/**
 * Parse a relative specifier into leading-dot count and optional remainder.
 *   '.'       → { dots: 1, rest: '' }
 *   '..'      → { dots: 2, rest: '' }
 *   '.foo'    → { dots: 1, rest: 'foo' }
 *   '..pkg.x' → { dots: 2, rest: 'pkg.x' }
 */
export const parseRelativeSpecifier = (
  specifier: string,
): { dots: number; rest: string } | null => {
  if (!specifier.startsWith('.')) return null;
  let dots = 0;
  while (dots < specifier.length && specifier[dots] === '.') dots += 1;
  const rest = specifier.slice(dots);
  return { dots, rest };
};

/**
 * Walk up `levels` parent directories from `dir`. Returns null if we escape
 * above the repository root (empty path).
 */
const walkUp = (dir: string, levels: number): string | null => {
  let current = dir === '.' ? '' : dir;
  for (let i = 0; i < levels; i++) {
    if (current === '' || current === '.') return null;
    const parent = posix.dirname(current);
    // posix.dirname('foo') === '.' — treat as repo root.
    current = parent === '.' ? '' : parent;
  }
  return current;
};

export const createPythonImportResolver = (
  allFilePaths: readonly string[],
): PythonImportResolver => {
  const fileSet = new Set(allFilePaths);

  const resolveAbsolute = (dotted: string): string | null => {
    if (!dotted || dotted.startsWith('.')) return null;
    const modulePath = dotted.split('.').join('/');
    return firstExisting(candidatesForModulePath(modulePath), fileSet);
  };

  const resolveInDirectory = (dir: string, restDotted: string): string | null => {
    if (!restDotted) {
      // Bare relative package: prefer `__init__.py` in this directory.
      const initPath = dir === '' ? '__init__.py' : posix.join(dir, '__init__.py');
      return fileSet.has(initPath) ? initPath : null;
    }
    const restPath = restDotted.split('.').join('/');
    const base = dir === '' ? restPath : posix.join(dir, restPath);
    return firstExisting(candidatesForModulePath(base), fileSet);
  };

  const resolveRelative = (fromFile: string, specifier: string): string | null => {
    const parsed = parseRelativeSpecifier(specifier);
    if (!parsed) return null;

    // Package directory of the importing module = its containing folder.
    // For `pkg/mod.py` and `pkg/__init__.py` alike, that folder is `pkg`.
    const packageDir = posix.dirname(fromFile);
    const startDir = packageDir === '.' ? '' : packageDir;

    // N leading dots → go up (N - 1) levels from the package directory.
    const targetDir = walkUp(startDir, parsed.dots - 1);
    if (targetDir === null) return null;

    return resolveInDirectory(targetDir, parsed.rest);
  };

  return {
    resolve(fromFile: string, specifier: string): string | null {
      if (!specifier) return null;
      if (specifier.startsWith('.')) return resolveRelative(fromFile, specifier);
      return resolveAbsolute(specifier);
    },
  };
};
