import { describe, expect, it } from 'vitest';
import {
  isSupportedLanguage,
  languageFromExtension,
  parseSource,
} from '../parserService.js';

describe('parserService', () => {
  describe('languageFromExtension', () => {
    it('maps ts/tsx/js/jsx/mjs/cjs to the correct language', () => {
      expect(languageFromExtension('ts')).toBe('typescript');
      expect(languageFromExtension('tsx')).toBe('tsx');
      expect(languageFromExtension('js')).toBe('javascript');
      expect(languageFromExtension('jsx')).toBe('javascript');
      expect(languageFromExtension('mjs')).toBe('javascript');
      expect(languageFromExtension('cjs')).toBe('javascript');
      expect(languageFromExtension('mts')).toBe('typescript');
      expect(languageFromExtension('cts')).toBe('typescript');
    });

    it('maps known languages and returns null for unsupported extensions', () => {
      expect(languageFromExtension('py')).toBe('python');
      expect(languageFromExtension('md')).toBeNull();
      expect(languageFromExtension(undefined)).toBeNull();
      expect(languageFromExtension('')).toBeNull();
    });

    it('is case-insensitive', () => {
      expect(languageFromExtension('TS')).toBe('typescript');
      expect(languageFromExtension('TSX')).toBe('tsx');
    });
  });

  describe('isSupportedLanguage', () => {
    it('reports supported extensions', () => {
      expect(isSupportedLanguage('ts')).toBe(true);
      expect(isSupportedLanguage('py')).toBe(true);
      expect(isSupportedLanguage('md')).toBe(false);
      expect(isSupportedLanguage(undefined)).toBe(false);
    });
  });

  describe('parseSource', () => {
    it('parses valid TypeScript to a program root without errors', () => {
      const result = parseSource('typescript', 'const x: number = 42;');
      expect(result.rootNode.type).toBe('program');
      expect(result.hasErrors).toBe(false);
    });

    it('parses valid JavaScript', () => {
      const result = parseSource('javascript', 'function greet(name) { return `hi ${name}`; }');
      expect(result.rootNode.type).toBe('program');
      expect(result.hasErrors).toBe(false);
    });

    it('parses TSX with JSX', () => {
      const result = parseSource('tsx', 'const el = <div id="x">hi</div>;');
      expect(result.rootNode.type).toBe('program');
      expect(result.hasErrors).toBe(false);
    });

    it('parses valid Python to a module root without errors', () => {
      const result = parseSource('python', 'def greet(name):\n    return name\n');
      expect(result.rootNode.type).toBe('module');
      expect(result.hasErrors).toBe(false);
      expect(languageFromExtension('py')).toBe('python');
    });

    it('does not throw on empty source', () => {
      const result = parseSource('typescript', '');
      expect(result.rootNode.type).toBe('program');
      expect(result.rootNode.namedChildCount).toBe(0);
    });

    it('reports hasErrors on invalid syntax', () => {
      const result = parseSource('typescript', 'const x = ;;;');
      expect(result.hasErrors).toBe(true);
    });

    it('reuses the parser instance across calls (smoke test)', () => {
      const a = parseSource('typescript', 'const a = 1;');
      const b = parseSource('typescript', 'const b = 2;');
      expect(a.rootNode.type).toBe('program');
      expect(b.rootNode.type).toBe('program');
    });
  });
});
