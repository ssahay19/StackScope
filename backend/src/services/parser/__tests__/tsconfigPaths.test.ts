import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  expandPathAliases,
  findTsconfigPath,
  loadTsconfigAliases,
  type PathAliasConfig,
} from '../tsconfigPaths.js';
import { createImportResolver } from '../importResolver.js';

describe('findTsconfigPath', () => {
  it('prefers root tsconfig.json over nested configs', () => {
    expect(
      findTsconfigPath(['tsconfig.json', 'apps/web/tsconfig.json', 'src/foo.ts']),
    ).toBe('tsconfig.json');
  });

  it('falls back to jsconfig.json', () => {
    expect(findTsconfigPath(['jsconfig.json', 'src/a.js'])).toBe('jsconfig.json');
  });

  it('picks the shallowest nested config when no root config exists', () => {
    expect(
      findTsconfigPath(['apps/web/tsconfig.json', 'apps/web/src/deep/tsconfig.json']),
    ).toBe('apps/web/tsconfig.json');
  });
});

describe('expandPathAliases', () => {
  const aliases = (paths: Record<string, string[]>, baseUrl = 'src'): PathAliasConfig => ({
    configDir: '',
    configPath: 'tsconfig.json',
    baseUrl,
    paths,
  });

  it('expands @/* → src/*', () => {
    const cfg = aliases({ '@/*': ['*'] }, 'src');
    expect(expandPathAliases('@/components/Button', cfg)).toEqual([
      'src/components/Button',
    ]);
  });

  it('supports multi-target paths entries (tries each)', () => {
    const cfg = aliases({ '@lib/*': ['lib/*', 'legacy/lib/*'] }, '');
    expect(expandPathAliases('@lib/util', cfg)).toEqual(['lib/util', 'legacy/lib/util']);
  });

  it('matches exact (non-wildcard) patterns', () => {
    const cfg = aliases({ '@shared': ['shared/index'] }, 'src');
    expect(expandPathAliases('@shared', cfg)).toEqual(['src/shared/index']);
  });
});

describe('loadTsconfigAliases', () => {
  it('parses JSONC (comments + trailing commas)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tsconfig-jsonc-'));
    try {
      await writeFile(
        join(dir, 'tsconfig.json'),
        `{
  // base comment
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"], // trailing comma below
    },
  },
}
`,
        'utf8',
      );
      const cfg = await loadTsconfigAliases(dir, ['tsconfig.json', 'src/a.ts']);
      expect(cfg).not.toBeNull();
      expect(cfg!.paths['@/*']).toEqual(['./src/*']);
      expect(cfg!.baseUrl).toBe('');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('merges one-level extends (base paths + child override)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tsconfig-extends-'));
    try {
      await writeFile(
        join(dir, 'tsconfig.base.json'),
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '@/*': ['./src/*'],
              '~/*': ['./legacy/*'],
            },
          },
        }),
        'utf8',
      );
      await writeFile(
        join(dir, 'tsconfig.json'),
        JSON.stringify({
          extends: './tsconfig.base.json',
          compilerOptions: {
            paths: {
              '@/*': ['./app/*'], // overrides base @/*
            },
          },
        }),
        'utf8',
      );
      const cfg = await loadTsconfigAliases(dir, [
        'tsconfig.json',
        'tsconfig.base.json',
        'app/x.ts',
      ]);
      expect(cfg).not.toBeNull();
      expect(cfg!.paths['@/*']).toEqual(['./app/*']);
      expect(cfg!.paths['~/*']).toEqual(['./legacy/*']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('importResolver — path aliases (Phase 5B)', () => {
  const files = [
    'src/pages/index.ts',
    'src/components/Button.tsx',
    'src/lib/util.ts',
    'src/lib/index.ts',
    'legacy/lib/old.ts',
    'tsconfig.json',
  ];

  const aliases: PathAliasConfig = {
    configDir: '',
    configPath: 'tsconfig.json',
    baseUrl: '',
    paths: {
      '@/*': ['./src/*'],
      '@lib/*': ['./src/lib/*', './legacy/lib/*'],
    },
  };

  it('resolves @/* to src/*', () => {
    const r = createImportResolver(files, { aliases });
    expect(r.resolve('src/pages/index.ts', '@/components/Button')).toBe(
      'src/components/Button.tsx',
    );
  });

  it('tries multi-target paths in order', () => {
    const r = createImportResolver(files, { aliases });
    // First target hits src/lib/util.ts
    expect(r.resolve('src/pages/index.ts', '@lib/util')).toBe('src/lib/util.ts');
    // Only in legacy
    expect(r.resolve('src/pages/index.ts', '@lib/old')).toBe('legacy/lib/old.ts');
  });

  it('resolves alias targets via index files', () => {
    const r = createImportResolver(files, { aliases });
    expect(r.resolve('src/pages/index.ts', '@/lib')).toBe('src/lib/index.ts');
  });

  it('keeps bare package imports external (react)', () => {
    const r = createImportResolver(files, { aliases });
    expect(r.resolve('src/pages/index.ts', 'react')).toBeNull();
    expect(r.resolve('src/pages/index.ts', 'lodash/fp')).toBeNull();
  });

  it('still resolves relative imports when aliases are configured', () => {
    const r = createImportResolver(files, { aliases });
    expect(r.resolve('src/pages/index.ts', '../lib/util')).toBe('src/lib/util.ts');
  });

  it('returns null for unmatched aliases', () => {
    const r = createImportResolver(files, { aliases });
    expect(r.resolve('src/pages/index.ts', '@/missing/Thing')).toBeNull();
  });
});

describe('loadTsconfigAliases + createImportResolver integration', () => {
  it('end-to-end: load JSONC config from disk and resolve @/ import', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'alias-e2e-'));
    try {
      await mkdir(join(dir, 'src/components'), { recursive: true });
      await mkdir(join(dir, 'src/pages'), { recursive: true });
      await writeFile(
        join(dir, 'tsconfig.json'),
        `{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
`,
        'utf8',
      );
      await writeFile(join(dir, 'src/components/Button.tsx'), 'export const Button = 1;\n');
      await writeFile(
        join(dir, 'src/pages/home.ts'),
        `import { Button } from '@/components/Button';\n`,
      );

      const paths = [
        'tsconfig.json',
        'src/components/Button.tsx',
        'src/pages/home.ts',
      ];
      const cfg = await loadTsconfigAliases(dir, paths);
      const r = createImportResolver(paths, { aliases: cfg });
      expect(r.resolve('src/pages/home.ts', '@/components/Button')).toBe(
        'src/components/Button.tsx',
      );
      expect(r.resolve('src/pages/home.ts', 'react')).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
