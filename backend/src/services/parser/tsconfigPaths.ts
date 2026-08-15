import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import { logger } from '../../utils/logger.js';

/**
 * tsconfigPaths — Phase 5B
 *
 * Load `compilerOptions.baseUrl` + `compilerOptions.paths` from a repo's
 * tsconfig.json / jsconfig.json (JSONC-tolerant). Supports one level of
 * `extends` so a thin app config can inherit paths from a base config.
 *
 * Deep extends chains, project references, and per-file configs are out of
 * scope — anything we can't load cleanly yields `null` and the resolver
 * falls back to relative-only behavior.
 */

const log = logger.child({ service: 'tsconfigPaths' });

const CONFIG_BASENAMES = ['tsconfig.json', 'jsconfig.json'] as const;

export interface PathAliasConfig {
  /** Repo-relative directory of the chosen config file ('' = repo root). */
  configDir: string;
  /** Repo-relative path to the config file that was loaded. */
  configPath: string;
  /**
   * Effective baseUrl, already joined with `configDir` and normalized to a
   * repo-relative POSIX directory ('' = repo root).
   */
  baseUrl: string;
  /** pattern → substitution targets, as declared in tsconfig (e.g. `@/*` → `src/*`). */
  paths: Record<string, string[]>;
}

interface RawCompilerOptions {
  baseUrl?: unknown;
  paths?: unknown;
}

interface RawTsconfig {
  extends?: unknown;
  compilerOptions?: RawCompilerOptions;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asString = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

const asPathsMap = (v: unknown): Record<string, string[]> | null => {
  if (!isRecord(v)) return null;
  const out: Record<string, string[]> = {};
  for (const [pattern, targets] of Object.entries(v)) {
    if (!Array.isArray(targets)) continue;
    const cleaned = targets.filter((t): t is string => typeof t === 'string' && t.length > 0);
    if (cleaned.length > 0) out[pattern] = cleaned;
  }
  return Object.keys(out).length > 0 ? out : null;
};

/** Prefer root tsconfig/jsconfig; otherwise the shallowest config in the scan. */
export const findTsconfigPath = (allFilePaths: readonly string[]): string | null => {
  const fileSet = new Set(allFilePaths);
  for (const name of CONFIG_BASENAMES) {
    if (fileSet.has(name)) return name;
  }

  const nested = allFilePaths
    .filter((p) => {
      const base = posix.basename(p);
      return (CONFIG_BASENAMES as readonly string[]).includes(base);
    })
    .filter((p) => !p.includes('node_modules/'))
    .sort((a, b) => {
      const depth = (s: string) => (s.match(/\//g) ?? []).length;
      return depth(a) - depth(b) || a.localeCompare(b);
    });

  return nested[0] ?? null;
};

const readJsoncFile = async (absPath: string): Promise<RawTsconfig | null> => {
  let text: string;
  try {
    text = await readFile(absPath, 'utf8');
  } catch {
    return null;
  }

  const errors: Array<{ error: number; offset: number; length: number }> = [];
  const parsed = parseJsonc(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as unknown;

  if (errors.length > 0 || !isRecord(parsed)) {
    log.warn({ path: absPath, errorCount: errors.length }, 'tsconfig JSONC parse failed');
    return null;
  }
  return parsed as RawTsconfig;
};

/**
 * Resolve a one-level `extends` path relative to the extending config's
 * directory. Supports `./foo`, `../foo`, and bare `foo` / `foo/bar` as a
 * relative path under the config dir. Package-name extends (`@tsconfig/node`)
 * are not followed (no node_modules resolution).
 */
const resolveExtendsPath = (configDir: string, extendsSpec: string): string | null => {
  // Skip package-style extends (no relative prefix, looks like a package name).
  if (
    !extendsSpec.startsWith('./') &&
    !extendsSpec.startsWith('../') &&
    !extendsSpec.startsWith('/') &&
    !extendsSpec.endsWith('.json')
  ) {
    // Could still be a relative path without ./ — treat as relative to configDir
    // only if it contains a slash or clearly ends with .json; otherwise skip.
    if (!extendsSpec.includes('/') && !extendsSpec.includes('\\')) {
      log.info({ extendsSpec }, 'skipping package-name tsconfig extends');
      return null;
    }
  }

  let rel = extendsSpec.replace(/\\/g, '/');
  if (!rel.endsWith('.json')) rel = `${rel}.json`;
  const joined = posix.normalize(posix.join(configDir || '.', rel));
  // Normalize away a leading `./`
  return joined.startsWith('./') ? joined.slice(2) : joined === '.' ? '' : joined;
};

const mergeCompilerOptions = (
  base: RawCompilerOptions | undefined,
  child: RawCompilerOptions | undefined,
): { baseUrl: string | null; paths: Record<string, string[]> } => {
  const basePaths = asPathsMap(base?.paths) ?? {};
  const childPaths = asPathsMap(child?.paths) ?? {};
  const paths = { ...basePaths, ...childPaths };

  const baseUrl =
    asString(child?.baseUrl) ?? asString(base?.baseUrl) ?? null;

  return { baseUrl, paths };
};

/**
 * Load path-alias config from the cloned repo. Returns null when no usable
 * tsconfig/jsconfig is found or when it declares neither baseUrl nor paths.
 */
export const loadTsconfigAliases = async (
  clonedRoot: string,
  allFilePaths: readonly string[],
): Promise<PathAliasConfig | null> => {
  const configPath = findTsconfigPath(allFilePaths);
  if (!configPath) return null;

  const configDir = posix.dirname(configPath);
  const configDirNorm = configDir === '.' ? '' : configDir;

  const raw = await readJsoncFile(join(clonedRoot, configPath));
  if (!raw) return null;

  let baseOptions: RawCompilerOptions | undefined;
  const extendsSpec = asString(raw.extends);
  if (extendsSpec) {
    const extendsRel = resolveExtendsPath(configDirNorm, extendsSpec);
    if (extendsRel) {
      const baseRaw = await readJsoncFile(join(clonedRoot, extendsRel));
      if (baseRaw?.compilerOptions) {
        baseOptions = baseRaw.compilerOptions;
      } else {
        log.info({ extendsRel }, 'tsconfig extends target missing or empty');
      }
    }
  }

  const { baseUrl: rawBaseUrl, paths } = mergeCompilerOptions(
    baseOptions,
    raw.compilerOptions,
  );

  if (Object.keys(paths).length === 0 && rawBaseUrl === null) {
    return null;
  }

  // Effective baseUrl is relative to the config file's directory.
  const baseUrlJoined = posix.normalize(
    posix.join(configDirNorm || '.', rawBaseUrl ?? '.'),
  );
  const baseUrl =
    baseUrlJoined === '.' || baseUrlJoined === ''
      ? ''
      : baseUrlJoined.replace(/^\.\//, '').replace(/\/+$/, '');

  log.info(
    {
      configPath,
      baseUrl: baseUrl || '.',
      aliasCount: Object.keys(paths).length,
      extended: Boolean(extendsSpec),
    },
    'loaded tsconfig path aliases',
  );

  return {
    configDir: configDirNorm,
    configPath,
    baseUrl,
    paths,
  };
};

/**
 * Expand a non-relative specifier against `paths` patterns.
 * Returns candidate module bases (no extension), repo-relative.
 *
 * Supports the common single-`*` wildcard form (`@/*` → `src/*`). Exact
 * patterns without a star are also matched. Multi-star / exotic patterns
 * are ignored (left for external fallback).
 */
export const expandPathAliases = (
  specifier: string,
  aliases: PathAliasConfig,
): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const [pattern, targets] of Object.entries(aliases.paths)) {
    const starIndex = pattern.indexOf('*');
    if (starIndex !== -1 && pattern.indexOf('*', starIndex + 1) !== -1) {
      // Multi-star — out of scope.
      continue;
    }

    let matched: string | null = null;
    if (starIndex === -1) {
      if (specifier === pattern) matched = '';
    } else {
      const prefix = pattern.slice(0, starIndex);
      const suffix = pattern.slice(starIndex + 1);
      if (specifier.startsWith(prefix) && specifier.endsWith(suffix)) {
        matched = specifier.slice(prefix.length, specifier.length - suffix.length);
      }
    }
    if (matched === null) continue;

    for (const target of targets) {
      const tStar = target.indexOf('*');
      let expanded: string;
      if (tStar === -1) {
        expanded = target;
      } else {
        expanded = target.slice(0, tStar) + matched + target.slice(tStar + 1);
      }

      // Target paths are relative to baseUrl.
      const joined = posix.normalize(
        posix.join(aliases.baseUrl || '.', expanded),
      );
      const normalized =
        joined === '.' ? '' : joined.replace(/^\.\//, '').replace(/\/+$/, '');

      if (!normalized || seen.has(normalized)) continue;
      // Bail on escape above repo root.
      if (normalized.startsWith('../') || normalized === '..') continue;
      seen.add(normalized);
      out.push(normalized);
    }
  }

  return out;
};

/**
 * When there are no `paths` but there is a `baseUrl`, TypeScript still
 * resolves non-relative imports as `baseUrl/specifier`. We only do this
 * when the specifier looks path-like (contains `/` or clearly not a package
 * name) — actually TS resolves ALL non-relative against baseUrl first
 * before node_modules. That would incorrectly resolve `react` to
 * `src/react.ts` if it existed.
 *
 * To keep bare package imports external (required), we do NOT fall back to
 * baseUrl-only resolution for bare names. Only explicit `paths` entries
 * create alias hits. baseUrl alone still matters as the root for path
 * target expansion.
 */
export const expandSpecifierWithAliases = (
  specifier: string,
  aliases: PathAliasConfig | null | undefined,
): string[] => {
  if (!aliases || Object.keys(aliases.paths).length === 0) return [];
  return expandPathAliases(specifier, aliases);
};
