import type Parser from 'tree-sitter';
import type { CodeSymbol, ImportRef, SymbolKind } from '../../types/parsing.js';

/**
 * pythonSymbolExtractor — Phase 5A
 *
 * Top-level-only extraction of Python imports, functions, and classes from a
 * tree-sitter `module` root. Nested `def`/`class` bodies are intentionally
 * skipped, matching the TS/JS extractor's "module surface" rule.
 *
 * Import forms covered:
 *   import a / import a.b.c / import a as b / import a, b
 *   from a import x / from a import x, y / from a import *
 *   from a import x as z
 *   from . import x / from ..pkg import y / from .foo import bar
 *
 * `ImportRef.source` is the module specifier the Python import resolver
 * understands (dotted absolute path, or a relative form like `.`, `..pkg`,
 * `.foo`). For `from . import x` we emit one ImportRef per name with source
 * `.x` so submodule edges resolve; the package itself is also referenced
 * when useful via the resolver's relative base.
 */

const locationOf = (node: Parser.SyntaxNode) => ({
  startLine: node.startPosition.row + 1,
  endLine: node.endPosition.row + 1,
  startColumn: node.startPosition.column,
  endColumn: node.endPosition.column,
});

const symbolIdOf = (filePath: string, kind: SymbolKind, name: string, startLine: number): string =>
  `${filePath}#${kind}:${name}@${startLine}`;

const findChildByType = (node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c && c.type === type) return c;
  }
  return null;
};

const dottedNameText = (node: Parser.SyntaxNode | null): string | null => {
  if (!node) return null;
  if (node.type === 'dotted_name' || node.type === 'identifier') return node.text;
  return null;
};

/** Join a relative/absolute module base with an imported name → submodule specifier. */
export const joinPythonModule = (base: string, name: string): string => {
  if (base === '' || base === '.') return `.${name}`;
  // base is only dots (`..`, `...`) — append the name directly: `..` + `pkg` is wrong;
  // for pure-dot bases used with `from . import x` we already pass `.x` as base.
  if (/^\.+$/.test(base)) return `${base}${name}`;
  return `${base}.${name}`;
};

// ---------- imports ----------

const makeImport = (source: string, importedNames: string[]): ImportRef => ({
  source,
  resolvedPath: null,
  importedNames,
  isTypeOnly: false,
  kind: 'import',
});

/**
 * `import a`, `import a.b.c`, `import a as b`, `import a, b`.
 * Each module becomes its own ImportRef.
 */
const extractImportStatement = (node: Parser.SyntaxNode): ImportRef[] => {
  const out: ImportRef[] = [];

  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;

    if (child.type === 'dotted_name') {
      out.push(makeImport(child.text, [child.text]));
    } else if (child.type === 'aliased_import') {
      const moduleNode = findChildByType(child, 'dotted_name');
      const alias = findChildByType(child, 'identifier');
      const module = dottedNameText(moduleNode);
      if (module === null) continue;
      // Record the source-side module name (alias is local binding only).
      out.push(makeImport(module, [alias?.text ?? module]));
    }
  }

  return out;
};

/**
 * Collect imported names from the right-hand side of `from … import …`.
 */
const collectImportedNames = (node: Parser.SyntaxNode, moduleChildCount: number): string[] => {
  const names: string[] = [];

  for (let i = moduleChildCount; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;

    if (child.type === 'dotted_name' || child.type === 'identifier') {
      names.push(child.text);
    } else if (child.type === 'aliased_import') {
      const original = findChildByType(child, 'dotted_name') ?? findChildByType(child, 'identifier');
      if (original) names.push(original.text);
    } else if (child.type === 'wildcard_import') {
      names.push('*');
    }
  }

  return names;
};

/**
 * `from a import x`, `from . import x`, `from ..pkg import y`, etc.
 *
 * For pure-dot module bases (`from . import x, y`) we emit one ImportRef per
 * name with source `.x` / `.y` so the resolver can find submodules. For any
 * other module base we emit a single ImportRef for the module and additional
 * submodule-candidate refs per name (the pipeline keeps only those that
 * resolve, via the resolver returning null for attributes).
 */
const extractImportFromStatement = (node: Parser.SyntaxNode): ImportRef[] => {
  const relative = findChildByType(node, 'relative_import');
  let moduleSource: string | null = null;
  let moduleChildCount = 0;

  if (relative) {
    moduleSource = relative.text;
    moduleChildCount = 1; // the relative_import is the first named child
  } else {
    // Absolute: first dotted_name is the module; subsequent are imported names.
    const first = node.namedChild(0);
    if (first && first.type === 'dotted_name') {
      moduleSource = first.text;
      moduleChildCount = 1;
    }
  }

  if (moduleSource === null) return [];

  const names = collectImportedNames(node, moduleChildCount);
  const out: ImportRef[] = [];

  if (/^\.+$/.test(moduleSource)) {
    // `from . import x` / `from .. import y` — each name is a submodule.
    if (names.length === 0 || (names.length === 1 && names[0] === '*')) {
      out.push(makeImport(moduleSource, names.length ? names : ['*']));
    } else {
      for (const name of names) {
        if (name === '*') {
          out.push(makeImport(moduleSource, ['*']));
        } else {
          out.push(makeImport(joinPythonModule(moduleSource, name), [name]));
        }
      }
    }
    return out;
  }

  // Module base is absolute or relative-with-name (`.foo`, `..pkg`).
  out.push(makeImport(moduleSource, names.length > 0 ? names : []));

  // Submodule candidates: `from pkg import sub` often means pkg/sub.py.
  for (const name of names) {
    if (name === '*') continue;
    out.push(makeImport(joinPythonModule(moduleSource, name), [name]));
  }

  return out;
};

// ---------- symbols ----------

interface SymbolCtx {
  filePath: string;
  symbols: CodeSymbol[];
}

const pushSymbol = (
  ctx: SymbolCtx,
  kind: SymbolKind,
  nameNode: Parser.SyntaxNode | null,
  targetNode: Parser.SyntaxNode,
): void => {
  if (!nameNode || nameNode.type !== 'identifier') return;
  const loc = locationOf(targetNode);
  ctx.symbols.push({
    id: symbolIdOf(ctx.filePath, kind, nameNode.text, loc.startLine),
    name: nameNode.text,
    kind,
    location: loc,
    // Python has no `export` keyword; top-level names are module-public by
    // convention (unless underscore-private). We mark all top-level as exported.
    exported: !nameNode.text.startsWith('_'),
  });
};

const extractDefinition = (node: Parser.SyntaxNode, ctx: SymbolCtx): void => {
  let target = node;
  if (node.type === 'decorated_definition') {
    const inner =
      findChildByType(node, 'function_definition') ?? findChildByType(node, 'class_definition');
    if (!inner) return;
    target = inner;
  }

  if (target.type === 'function_definition') {
    pushSymbol(ctx, 'function', findChildByType(target, 'identifier'), target);
    return;
  }
  if (target.type === 'class_definition') {
    pushSymbol(ctx, 'class', findChildByType(target, 'identifier'), target);
  }
};

// ---------- entry point ----------

export interface ExtractionResult {
  imports: ImportRef[];
  symbols: CodeSymbol[];
}

/**
 * Extract top-level imports + symbols from a Python `module` root.
 */
export const extractPythonSymbolsAndImports = (
  filePath: string,
  root: Parser.SyntaxNode,
): ExtractionResult => {
  const ctx: SymbolCtx = { filePath, symbols: [] };
  const imports: ImportRef[] = [];

  for (let i = 0; i < root.namedChildCount; i++) {
    const stmt = root.namedChild(i);
    if (!stmt) continue;

    switch (stmt.type) {
      case 'import_statement':
        imports.push(...extractImportStatement(stmt));
        break;
      case 'import_from_statement':
        imports.push(...extractImportFromStatement(stmt));
        break;
      case 'function_definition':
      case 'class_definition':
      case 'decorated_definition':
        extractDefinition(stmt, ctx);
        break;
      default:
        break;
    }
  }

  return { imports, symbols: ctx.symbols };
};
