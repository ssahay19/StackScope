import Parser from 'tree-sitter';
import TS from 'tree-sitter-typescript';
import JS from 'tree-sitter-javascript';

/**
 * parserService
 *
 * The only place that talks to tree-sitter directly. Responsibilities:
 *   1. Own the language registry.
 *   2. Cache a Parser instance per language (parsers are stateful).
 *   3. Resolve a language from a file's extension.
 *   4. Provide a single `parseSource(language, source)` entry point that
 *      returns a normalized `ParseResult`.
 *
 * Adding a new language later is one entry in `LANGUAGE_REGISTRY` plus an
 * extension mapping in `LANGUAGE_BY_EXTENSION`.
 */

export type ParsedLanguage = 'typescript' | 'tsx' | 'javascript';

interface LanguageEntry {
  id: ParsedLanguage;
  displayName: string;
  grammar: unknown; // opaque tree-sitter Language object
}

const LANGUAGE_REGISTRY: Record<ParsedLanguage, LanguageEntry> = {
  typescript: { id: 'typescript', displayName: 'TypeScript', grammar: TS.typescript },
  tsx: { id: 'tsx', displayName: 'TypeScript (TSX)', grammar: TS.tsx },
  javascript: { id: 'javascript', displayName: 'JavaScript', grammar: JS },
};

const LANGUAGE_BY_EXTENSION: Record<string, ParsedLanguage> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
};

export const languageFromExtension = (ext: string | undefined): ParsedLanguage | null => {
  if (!ext) return null;
  return LANGUAGE_BY_EXTENSION[ext.toLowerCase()] ?? null;
};

export const displayNameOf = (lang: ParsedLanguage): string => LANGUAGE_REGISTRY[lang].displayName;

export const isSupportedLanguage = (ext: string | undefined): boolean =>
  languageFromExtension(ext) !== null;

// Parser instances are stateful — reuse per language to avoid setLanguage overhead.
const parserCache = new Map<ParsedLanguage, Parser>();

const getParser = (lang: ParsedLanguage): Parser => {
  let p = parserCache.get(lang);
  if (!p) {
    p = new Parser();
    // Cast because the tree-sitter typings expect a `Parser.Language` opaque type.
    // The grammar packages export the correct object shape at runtime.
    // The `setLanguage` typing is very loose in the current bindings; the
    // grammar object exported by the tree-sitter language packages is the
    // correct runtime shape.
    (p.setLanguage as (lang: unknown) => void)(LANGUAGE_REGISTRY[lang].grammar);
    parserCache.set(lang, p);
  }
  return p;
};

export interface ParseResult {
  language: ParsedLanguage;
  tree: Parser.Tree;
  rootNode: Parser.SyntaxNode;
  hasErrors: boolean;
}

/**
 * Parse a source string with the given language.
 *
 * tree-sitter never throws on syntax errors — the tree is always produced but
 * may contain ERROR nodes. Callers should consult `hasErrors` if they need to
 * decide whether to trust extraction.
 *
 * We wrap the actual parse call in a try/catch anyway because the native binding
 * can throw on bugs (rare, but not impossible).
 */
export const parseSource = (language: ParsedLanguage, source: string): ParseResult => {
  const parser = getParser(language);
  const tree = parser.parse(source);
  return {
    language,
    tree,
    rootNode: tree.rootNode,
    hasErrors: tree.rootNode.hasError,
  };
};

/** For tests: clear the parser cache so mocks/hot-reload behave predictably. */
export const _resetParserCache = (): void => {
  parserCache.clear();
};
