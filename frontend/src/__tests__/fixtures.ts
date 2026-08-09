import type { DependencyGraph, DependencyNode } from '../types/parsing';

/**
 * Small deterministic fixture used across component and lib tests.
 *
 *   src/index.ts   → src/auth.ts, src/utils.ts
 *   src/auth.ts    → src/utils.ts
 *   src/utils.ts   (leaf)
 *   src/auth.test.ts → src/auth.ts  (test file — should be hidable)
 *   README.md      (documentation, unsupported)
 *   tsconfig.json  (config)
 *   src/cycle-a.ts ↔ src/cycle-b.ts   (2-node cycle)
 */

const node = (partial: Partial<DependencyNode> & Pick<DependencyNode, 'filePath'>): DependencyNode => ({
  filePath: partial.filePath,
  language: partial.language ?? 'TypeScript',
  languageSupported: partial.languageSupported ?? true,
  imports: partial.imports ?? [],
  importedBy: partial.importedBy ?? [],
  symbols: partial.symbols ?? [],
  parseError: partial.parseError ?? null,
  skipped: partial.skipped ?? false,
  skipReason: partial.skipReason ?? null,
  category: partial.category ?? 'source',
  extension: partial.extension ?? 'ts',
  folder: partial.folder ?? 'src',
  symbolCount: partial.symbolCount ?? 0,
});

export const fixture: DependencyGraph = {
  nodes: [
    node({
      filePath: 'src/index.ts',
      imports: [
        { source: './auth', resolvedPath: 'src/auth.ts', importedNames: ['login'], isTypeOnly: false, kind: 'import' },
        { source: './utils', resolvedPath: 'src/utils.ts', importedNames: ['*'], isTypeOnly: false, kind: 'import' },
      ],
      importedBy: [],
      symbolCount: 2,
    }),
    node({
      filePath: 'src/auth.ts',
      imports: [
        { source: './utils', resolvedPath: 'src/utils.ts', importedNames: ['hash'], isTypeOnly: false, kind: 'import' },
      ],
      importedBy: ['src/index.ts', 'src/auth.test.ts'],
      symbolCount: 3,
    }),
    node({
      filePath: 'src/utils.ts',
      imports: [],
      importedBy: ['src/index.ts', 'src/auth.ts'],
      symbolCount: 5,
    }),
    node({
      filePath: 'src/auth.test.ts',
      category: 'test',
      imports: [
        { source: './auth', resolvedPath: 'src/auth.ts', importedNames: ['login'], isTypeOnly: false, kind: 'import' },
      ],
      importedBy: [],
      symbolCount: 1,
    }),
    node({
      filePath: 'README.md',
      language: 'MD',
      languageSupported: false,
      category: 'documentation',
      extension: 'md',
      folder: '',
      skipped: true,
      skipReason: 'unsupported-language',
    }),
    node({
      filePath: 'tsconfig.json',
      language: 'JSON',
      languageSupported: false,
      category: 'config',
      extension: 'json',
      folder: '',
      skipped: true,
      skipReason: 'unsupported-language',
    }),
    node({
      filePath: 'src/cycle-a.ts',
      imports: [
        { source: './cycle-b', resolvedPath: 'src/cycle-b.ts', importedNames: ['b'], isTypeOnly: false, kind: 'import' },
      ],
      importedBy: ['src/cycle-b.ts'],
    }),
    node({
      filePath: 'src/cycle-b.ts',
      imports: [
        { source: './cycle-a', resolvedPath: 'src/cycle-a.ts', importedNames: ['a'], isTypeOnly: false, kind: 'import' },
      ],
      importedBy: ['src/cycle-a.ts'],
    }),
  ],
  edges: [
    { from: 'src/index.ts', to: 'src/auth.ts' },
    { from: 'src/index.ts', to: 'src/utils.ts' },
    { from: 'src/auth.ts', to: 'src/utils.ts' },
    { from: 'src/auth.test.ts', to: 'src/auth.ts' },
    { from: 'src/cycle-a.ts', to: 'src/cycle-b.ts' },
    { from: 'src/cycle-b.ts', to: 'src/cycle-a.ts' },
  ],
};
