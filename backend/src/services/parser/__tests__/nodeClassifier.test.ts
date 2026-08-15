import { describe, expect, it } from 'vitest';
import { classifyFile, folderOf } from '../nodeClassifier.js';

describe('nodeClassifier — classifyFile', () => {
  it('recognizes ordinary TS/JS files as source', () => {
    expect(classifyFile('src/foo.ts', 'ts')).toBe('source');
    expect(classifyFile('src/foo.tsx', 'tsx')).toBe('source');
    expect(classifyFile('src/foo.js', 'js')).toBe('source');
    expect(classifyFile('lib/index.mjs', 'mjs')).toBe('source');
  });

  it('recognizes Python files as source', () => {
    expect(classifyFile('pkg/mod.py', 'py')).toBe('source');
    expect(classifyFile('pkg/__init__.py', 'py')).toBe('source');
  });

  it('recognizes test files by .test./.spec. extension', () => {
    expect(classifyFile('src/foo.test.ts', 'ts')).toBe('test');
    expect(classifyFile('src/foo.spec.tsx', 'tsx')).toBe('test');
    expect(classifyFile('lib/bar.test.js', 'js')).toBe('test');
  });

  it('recognizes files under __tests__ / test / tests as test', () => {
    expect(classifyFile('src/__tests__/foo.ts', 'ts')).toBe('test');
    expect(classifyFile('test/foo.ts', 'ts')).toBe('test');
    expect(classifyFile('tests/foo.ts', 'ts')).toBe('test');
  });

  it('recognizes common config filenames', () => {
    expect(classifyFile('tsconfig.json', 'json')).toBe('config');
    expect(classifyFile('tsconfig.build.json', 'json')).toBe('config');
    expect(classifyFile('vite.config.ts', 'ts')).toBe('config');
    expect(classifyFile('vitest.config.ts', 'ts')).toBe('config');
    expect(classifyFile('package.json', 'json')).toBe('config');
    expect(classifyFile('.eslintrc.js', 'js')).toBe('config');
    expect(classifyFile('.prettierrc', null)).toBe('config');
  });

  it('config beats source when both apply', () => {
    // vite.config.ts is a TS file but classifies as config
    expect(classifyFile('vite.config.ts', 'ts')).toBe('config');
  });

  it('test beats config when both apply', () => {
    // A hypothetical `__tests__/tsconfig.json` — extremely rare, but tests win.
    expect(classifyFile('__tests__/tsconfig.json', 'json')).toBe('test');
  });

  it('recognizes documentation, data, and style extensions', () => {
    expect(classifyFile('README.md', 'md')).toBe('documentation');
    expect(classifyFile('docs/guide.mdx', 'mdx')).toBe('documentation');
    expect(classifyFile('data/records.json', 'json')).toBe('data');
    expect(classifyFile('config.yml', 'yml')).toBe('data');
    expect(classifyFile('styles/main.css', 'css')).toBe('style');
    expect(classifyFile('styles/main.scss', 'scss')).toBe('style');
  });

  it('falls back to other for unknown extensions', () => {
    expect(classifyFile('mystery.xyz', 'xyz')).toBe('other');
    expect(classifyFile('no-extension', null)).toBe('other');
  });

  it('classifies TS/JS source files inside test directories consistently', () => {
    expect(classifyFile('packages/core/__tests__/util.ts', 'ts')).toBe('test');
  });
});

describe('nodeClassifier — folderOf', () => {
  it('returns empty string for repo-root files', () => {
    expect(folderOf('README.md')).toBe('');
    expect(folderOf('package.json')).toBe('');
  });

  it('returns the parent directory for nested files', () => {
    expect(folderOf('src/foo.ts')).toBe('src');
    expect(folderOf('packages/core/src/index.ts')).toBe('packages/core/src');
  });
});
