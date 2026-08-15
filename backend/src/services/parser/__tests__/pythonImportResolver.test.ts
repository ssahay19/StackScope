import { describe, expect, it } from 'vitest';
import {
  createPythonImportResolver,
  parseRelativeSpecifier,
} from '../pythonImportResolver.js';

describe('parseRelativeSpecifier', () => {
  it('parses leading dots and remainder', () => {
    expect(parseRelativeSpecifier('.')).toEqual({ dots: 1, rest: '' });
    expect(parseRelativeSpecifier('..')).toEqual({ dots: 2, rest: '' });
    expect(parseRelativeSpecifier('.foo')).toEqual({ dots: 1, rest: 'foo' });
    expect(parseRelativeSpecifier('..pkg.sub')).toEqual({ dots: 2, rest: 'pkg.sub' });
    expect(parseRelativeSpecifier('abs')).toBeNull();
  });
});

describe('pythonImportResolver — absolute modules', () => {
  it('resolves dotted modules to .py files', () => {
    const r = createPythonImportResolver(['a/b/c.py', 'other.py']);
    expect(r.resolve('main.py', 'a.b.c')).toBe('a/b/c.py');
  });

  it('resolves packages via __init__.py', () => {
    const r = createPythonImportResolver(['pkg/__init__.py', 'pkg/util.py']);
    expect(r.resolve('main.py', 'pkg')).toBe('pkg/__init__.py');
  });

  it('prefers module.py over package/__init__.py when both exist', () => {
    // candidatesForModulePath lists `.py` before `__init__.py`.
    const r = createPythonImportResolver(['pkg.py', 'pkg/__init__.py']);
    expect(r.resolve('main.py', 'pkg')).toBe('pkg.py');
  });

  it('returns null for unresolved / external modules', () => {
    const r = createPythonImportResolver(['main.py']);
    expect(r.resolve('main.py', 'os')).toBeNull();
    expect(r.resolve('main.py', 'requests.api')).toBeNull();
  });
});

describe('pythonImportResolver — relative imports', () => {
  it('resolves from . import sibling module (.x)', () => {
    const r = createPythonImportResolver(['pkg/mod.py', 'pkg/x.py', 'pkg/__init__.py']);
    expect(r.resolve('pkg/mod.py', '.x')).toBe('pkg/x.py');
  });

  it('resolves from .foo import … to package submodule', () => {
    const r = createPythonImportResolver([
      'pkg/mod.py',
      'pkg/foo.py',
      'pkg/foo/__init__.py',
    ]);
    // `.py` wins over `__init__.py` when both listed — here foo.py exists.
    expect(r.resolve('pkg/mod.py', '.foo')).toBe('pkg/foo.py');
  });

  it('resolves from ..pkg import y against parent package', () => {
    const r = createPythonImportResolver([
      'pkg/sub/mod.py',
      'pkg/other.py',
      'pkg/__init__.py',
      'pkg/sub/__init__.py',
    ]);
    expect(r.resolve('pkg/sub/mod.py', '..other')).toBe('pkg/other.py');
  });

  it('resolves bare relative package (. → __init__.py)', () => {
    const r = createPythonImportResolver(['pkg/mod.py', 'pkg/__init__.py']);
    expect(r.resolve('pkg/mod.py', '.')).toBe('pkg/__init__.py');
  });

  it('returns null when relative escape leaves the repo', () => {
    const r = createPythonImportResolver(['mod.py']);
    expect(r.resolve('mod.py', '...pkg')).toBeNull();
  });

  it('does not treat namespace packages without __init__.py as packages for bare "."', () => {
    // Directory exists only as a parent of mod.py — no __init__.py.
    const r = createPythonImportResolver(['pkg/mod.py', 'pkg/x.py']);
    expect(r.resolve('pkg/mod.py', '.')).toBeNull();
    // But sibling modules still resolve.
    expect(r.resolve('pkg/mod.py', '.x')).toBe('pkg/x.py');
  });
});
