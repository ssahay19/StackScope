import { describe, expect, it } from 'vitest';
import { parseSource, type ParsedLanguage } from '../parserService.js';
import { extractSymbolsAndImports } from '../symbolExtractorService.js';

const extract = (source: string, language: ParsedLanguage = 'typescript') => {
  const parsed = parseSource(language, source);
  return extractSymbolsAndImports('src/example.ts', parsed.rootNode);
};

describe('symbolExtractorService — imports', () => {
  it('extracts named imports', () => {
    const { imports } = extract(`import { foo, bar } from './a';`);
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({
      source: './a',
      importedNames: ['foo', 'bar'],
      isTypeOnly: false,
      kind: 'import',
    });
  });

  it('extracts default imports as "default"', () => {
    const { imports } = extract(`import Foo from './a';`);
    expect(imports[0]?.importedNames).toEqual(['default']);
  });

  it('extracts namespace imports as "*"', () => {
    const { imports } = extract(`import * as ns from 'react';`);
    expect(imports[0]).toMatchObject({ source: 'react', importedNames: ['*'] });
  });

  it('extracts side-effect imports with empty names', () => {
    const { imports } = extract(`import './setup';`);
    expect(imports[0]).toMatchObject({ source: './setup', importedNames: [] });
  });

  it('marks `import type` as type-only', () => {
    const { imports } = extract(`import type { T } from './types';`);
    expect(imports[0]).toMatchObject({ source: './types', isTypeOnly: true });
  });

  it('extracts multiple imports in one file', () => {
    const { imports } = extract(`
      import a from './a';
      import { b, c } from './b';
      import * as d from './d';
    `);
    expect(imports).toHaveLength(3);
    expect(imports.map((i) => i.source)).toEqual(['./a', './b', './d']);
  });

  it('extracts CommonJS require() calls in JS', () => {
    const { imports } = extract(
      `const path = require('path'); const fs = require('./fs');`,
      'javascript',
    );
    expect(imports).toHaveLength(2);
    expect(imports.every((i) => i.kind === 'require')).toBe(true);
    expect(imports.map((i) => i.source)).toEqual(['path', './fs']);
  });

  it('extracts re-exports', () => {
    const { imports } = extract(`
      export { foo, bar as baz } from './a';
      export * from './b';
      export * as ns from './c';
    `);
    expect(imports).toHaveLength(3);
    expect(imports.map((i) => i.kind)).toEqual(['reexport', 'reexport', 'reexport']);
    expect(imports.map((i) => i.source)).toEqual(['./a', './b', './c']);
  });
});

describe('symbolExtractorService — symbols', () => {
  it('extracts function declarations', () => {
    const { symbols } = extract(`function greet(name: string): string { return name; }`);
    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({ name: 'greet', kind: 'function', exported: false });
  });

  it('extracts class declarations', () => {
    const { symbols } = extract(`class User { constructor(public name: string) {} }`);
    expect(symbols[0]).toMatchObject({ name: 'User', kind: 'class' });
  });

  it('extracts interface declarations', () => {
    const { symbols } = extract(`interface Repo { url: string; }`);
    expect(symbols[0]).toMatchObject({ name: 'Repo', kind: 'interface' });
  });

  it('extracts enum declarations', () => {
    const { symbols } = extract(`enum Color { Red, Green }`);
    expect(symbols[0]).toMatchObject({ name: 'Color', kind: 'enum' });
  });

  it('extracts type aliases', () => {
    const { symbols } = extract(`type ID = string | number;`);
    expect(symbols[0]).toMatchObject({ name: 'ID', kind: 'type-alias' });
  });

  it('distinguishes const from let/var (constant vs variable)', () => {
    const { symbols } = extract(`const A = 1; let b = 2; var c = 3;`);
    const byName = Object.fromEntries(symbols.map((s) => [s.name, s.kind]));
    expect(byName.A).toBe('constant');
    expect(byName.b).toBe('variable');
    expect(byName.c).toBe('variable');
  });

  it('flags exported declarations', () => {
    const { symbols } = extract(`
      export function fn() {}
      export class C {}
      export const K = 1;
      function hidden() {}
    `);
    const byName = Object.fromEntries(symbols.map((s) => [s.name, s.exported]));
    expect(byName.fn).toBe(true);
    expect(byName.C).toBe(true);
    expect(byName.K).toBe(true);
    expect(byName.hidden).toBe(false);
  });

  it('records 1-based line locations', () => {
    const { symbols } = extract(`\n\nfunction f() {}`); // f is on line 3
    expect(symbols[0]?.location.startLine).toBe(3);
  });

  it('produces stable, unique symbol IDs', () => {
    const { symbols } = extract(`
      function a() {}
      class b {}
      const c = 1;
    `);
    const ids = new Set(symbols.map((s) => s.id));
    expect(ids.size).toBe(symbols.length);
    for (const s of symbols) {
      expect(s.id).toContain('src/example.ts#');
      expect(s.id).toContain(`:${s.name}`);
    }
  });

  it('does NOT extract nested declarations as top-level symbols', () => {
    const { symbols } = extract(`
      function outer() {
        function inner() {}
        class Nested {}
      }
    `);
    expect(symbols.map((s) => s.name)).toEqual(['outer']);
  });

  it('handles empty files without error', () => {
    const { imports, symbols } = extract('');
    expect(imports).toEqual([]);
    expect(symbols).toEqual([]);
  });

  it('handles invalid syntax gracefully (best-effort)', () => {
    // Should not throw; some symbols may still be recovered.
    expect(() => extract(`const x = ;;; function ok() {}`)).not.toThrow();
  });

  it('records an anonymous default export as name "default"', () => {
    const { symbols } = extract(`export default {};`);
    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({ name: 'default', exported: true });
  });
});
