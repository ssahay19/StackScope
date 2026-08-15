import { describe, expect, it } from 'vitest';
import { parseSource } from '../parserService.js';
import {
  extractPythonSymbolsAndImports,
  joinPythonModule,
} from '../pythonSymbolExtractor.js';

const extract = (source: string, filePath = 'pkg/mod.py') => {
  const parsed = parseSource('python', source);
  expect(parsed.rootNode.type).toBe('module');
  return extractPythonSymbolsAndImports(filePath, parsed.rootNode);
};

describe('joinPythonModule', () => {
  it('joins absolute and relative bases', () => {
    expect(joinPythonModule('a.b', 'c')).toBe('a.b.c');
    expect(joinPythonModule('.', 'x')).toBe('.x');
    expect(joinPythonModule('..', 'pkg')).toBe('..pkg');
    expect(joinPythonModule('.foo', 'bar')).toBe('.foo.bar');
  });
});

describe('pythonSymbolExtractor — imports', () => {
  it('extracts import a', () => {
    const { imports } = extract('import a');
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({
      source: 'a',
      importedNames: ['a'],
      kind: 'import',
      isTypeOnly: false,
    });
  });

  it('extracts import a.b.c', () => {
    const { imports } = extract('import a.b.c');
    expect(imports[0]).toMatchObject({ source: 'a.b.c', importedNames: ['a.b.c'] });
  });

  it('extracts import a as b', () => {
    const { imports } = extract('import a as b');
    expect(imports[0]).toMatchObject({ source: 'a', importedNames: ['b'] });
  });

  it('extracts import a, b as multiple ImportRefs', () => {
    const { imports } = extract('import a, b');
    expect(imports.map((i) => i.source)).toEqual(['a', 'b']);
  });

  it('extracts from a import x', () => {
    const { imports } = extract('from a import x');
    const module = imports.find((i) => i.source === 'a');
    expect(module).toMatchObject({ importedNames: ['x'] });
    // Submodule candidate for attribute/submodule resolution.
    expect(imports.some((i) => i.source === 'a.x')).toBe(true);
  });

  it('extracts from a import x, y', () => {
    const { imports } = extract('from a import x, y');
    const module = imports.find((i) => i.source === 'a');
    expect(module?.importedNames).toEqual(['x', 'y']);
  });

  it('extracts from a import *', () => {
    const { imports } = extract('from a import *');
    expect(imports[0]).toMatchObject({ source: 'a', importedNames: ['*'] });
  });

  it('extracts from a import x as z', () => {
    const { imports } = extract('from a import x as z');
    const module = imports.find((i) => i.source === 'a');
    expect(module?.importedNames).toEqual(['x']);
  });

  it('extracts from . import x as submodule source .x', () => {
    const { imports } = extract('from . import x', 'pkg/mod.py');
    expect(imports).toEqual([
      expect.objectContaining({ source: '.x', importedNames: ['x'] }),
    ]);
  });

  it('extracts from ..pkg import y', () => {
    const { imports } = extract('from ..pkg import y', 'pkg/sub/mod.py');
    const module = imports.find((i) => i.source === '..pkg');
    expect(module).toMatchObject({ importedNames: ['y'] });
    expect(imports.some((i) => i.source === '..pkg.y')).toBe(true);
  });

  it('extracts from .foo import bar', () => {
    const { imports } = extract('from .foo import bar', 'pkg/mod.py');
    expect(imports.some((i) => i.source === '.foo' && i.importedNames.includes('bar'))).toBe(
      true,
    );
  });
});

describe('pythonSymbolExtractor — symbols', () => {
  it('extracts top-level functions', () => {
    const { symbols } = extract('def greet(name):\n    return name\n');
    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({ name: 'greet', kind: 'function', exported: true });
  });

  it('extracts async functions', () => {
    const { symbols } = extract('async def fetch():\n    pass\n');
    expect(symbols[0]).toMatchObject({ name: 'fetch', kind: 'function' });
  });

  it('extracts top-level classes', () => {
    const { symbols } = extract('class User:\n    pass\n');
    expect(symbols[0]).toMatchObject({ name: 'User', kind: 'class', exported: true });
  });

  it('marks underscore-prefixed names as not exported', () => {
    const { symbols } = extract('def _private():\n    pass\n');
    expect(symbols[0]).toMatchObject({ name: '_private', exported: false });
  });

  it('extracts decorated top-level defs', () => {
    const { symbols } = extract('@decorator\ndef foo():\n    pass\n');
    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({ name: 'foo', kind: 'function' });
  });

  it('does not extract nested defs or classes', () => {
    const { symbols } = extract(`
def outer():
    def inner():
        pass
    class Nested:
        pass
`);
    expect(symbols.map((s) => s.name)).toEqual(['outer']);
  });
});
