import { describe, expect, it } from 'vitest';
import { createImportResolver } from '../importResolver.js';

describe('importResolver', () => {
  it('resolves a relative import to a .ts file', () => {
    const r = createImportResolver(['src/foo.ts', 'src/bar.ts']);
    expect(r.resolve('src/foo.ts', './bar')).toBe('src/bar.ts');
  });

  it('prefers TypeScript extensions over JavaScript when both exist', () => {
    const r = createImportResolver(['src/foo.ts', 'src/bar.ts', 'src/bar.js']);
    expect(r.resolve('src/foo.ts', './bar')).toBe('src/bar.ts');
  });

  it('resolves to an index file when the target is a directory', () => {
    const r = createImportResolver(['src/foo.ts', 'src/utils/index.ts']);
    expect(r.resolve('src/foo.ts', './utils')).toBe('src/utils/index.ts');
  });

  it('resolves trailing-slash directory imports via index files', () => {
    const r = createImportResolver(['src/utils/index.ts']);
    expect(r.resolve('src/foo.ts', './utils/')).toBe('src/utils/index.ts');
  });

  it('follows explicit .js specifiers to .ts sources (NodeNext convention)', () => {
    const r = createImportResolver(['src/foo.ts', 'src/bar.ts']);
    expect(r.resolve('src/foo.ts', './bar.js')).toBe('src/bar.ts');
  });

  it('returns null for bare specifiers (external packages)', () => {
    const r = createImportResolver(['src/foo.ts']);
    expect(r.resolve('src/foo.ts', 'react')).toBeNull();
    expect(r.resolve('src/foo.ts', 'lodash/fp')).toBeNull();
  });

  it('returns null for unresolvable relative paths', () => {
    const r = createImportResolver(['src/foo.ts']);
    expect(r.resolve('src/foo.ts', './nonexistent')).toBeNull();
  });

  it('supports parent-directory imports', () => {
    const r = createImportResolver(['src/foo.ts', 'lib/helper.ts']);
    expect(r.resolve('src/foo.ts', '../lib/helper')).toBe('lib/helper.ts');
  });

  it('handles jsx/tsx resolution', () => {
    const r = createImportResolver(['ui/Button.tsx', 'ui/Icon.jsx']);
    expect(r.resolve('ui/Page.tsx', './Button')).toBe('ui/Button.tsx');
    expect(r.resolve('ui/Page.tsx', './Icon')).toBe('ui/Icon.jsx');
  });
});
