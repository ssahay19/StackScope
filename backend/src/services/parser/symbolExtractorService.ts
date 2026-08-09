import type Parser from 'tree-sitter';
import type { CodeSymbol, ImportRef, SymbolKind } from '../../types/parsing.js';

/**
 * symbolExtractorService
 *
 * Given a parsed tree-sitter `program` root, produce normalized imports and
 * symbols. This module is intentionally AST-node-type-driven rather than
 * query-based — tree-sitter queries add another moving part and buy us little
 * for the six declaration forms we care about in Phase 2.
 *
 * Design notes:
 *   - We only walk the top-level `program` children. Nested declarations
 *     (functions inside functions, classes inside blocks) are *not* extracted
 *     as top-level symbols — that matches how a reader thinks of a module's
 *     public surface.
 *   - Everything is best-effort. A malformed statement is skipped, not fatal.
 */

// ---------- helpers ----------

const locationOf = (node: Parser.SyntaxNode) => ({
  // tree-sitter positions are 0-based; we expose 1-based lines to match editor UX.
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

const findChildByTypes = (
  node: Parser.SyntaxNode,
  types: readonly string[],
): Parser.SyntaxNode | null => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c && types.includes(c.type)) return c;
  }
  return null;
};

/** Extract the literal value of a `string` node (skipping the surrounding quotes). */
const stringLiteralValue = (node: Parser.SyntaxNode | null): string | null => {
  if (!node || node.type !== 'string') return null;
  const fragment = findChildByType(node, 'string_fragment');
  if (fragment) return fragment.text;
  // Empty string: `""` — no string_fragment child. Treat as literal empty.
  return '';
};

const hasAnonChild = (node: Parser.SyntaxNode, tokenText: string): boolean => {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c && !c.isNamed && c.text === tokenText) return true;
  }
  return false;
};

// ---------- import extraction ----------

/**
 * Parse an `import_statement` node into a normalized ImportRef.
 * Returns null if the source cannot be identified (e.g. dynamic import).
 */
const extractImportStatement = (node: Parser.SyntaxNode): ImportRef | null => {
  const sourceNode = findChildByType(node, 'string');
  const source = stringLiteralValue(sourceNode);
  if (source === null) return null;

  const isTypeOnly = hasAnonChild(node, 'type');
  const clause = findChildByType(node, 'import_clause');

  // Side-effect only: `import './setup';`
  if (!clause) {
    return {
      source,
      resolvedPath: null,
      importedNames: [],
      isTypeOnly,
      kind: 'import',
    };
  }

  const names: string[] = [];
  for (let i = 0; i < clause.namedChildCount; i++) {
    const child = clause.namedChild(i);
    if (!child) continue;

    if (child.type === 'identifier') {
      // `import foo from 'x'`
      names.push('default');
    } else if (child.type === 'namespace_import') {
      // `import * as X from 'x'`
      names.push('*');
    } else if (child.type === 'named_imports') {
      for (let j = 0; j < child.namedChildCount; j++) {
        const spec = child.namedChild(j);
        if (!spec || spec.type !== 'import_specifier') continue;
        // `import { a, b as c } from 'x'` → we record the imported (source-side) name.
        const first = spec.namedChild(0);
        if (first) names.push(first.text);
      }
    }
  }

  return {
    source,
    resolvedPath: null,
    importedNames: names,
    isTypeOnly,
    kind: 'import',
  };
};

/**
 * Parse an `export_statement` node. Returns the re-export it produces, if any.
 * (Symbol-producing exports are handled in the symbol pass below.)
 */
const extractReexportStatement = (node: Parser.SyntaxNode): ImportRef | null => {
  const sourceNode = findChildByType(node, 'string');
  const source = stringLiteralValue(sourceNode);
  if (source === null) return null;

  const isTypeOnly = hasAnonChild(node, 'type');

  const exportClause = findChildByType(node, 'export_clause');
  const namespaceExport = findChildByType(node, 'namespace_export');

  const names: string[] = [];
  if (exportClause) {
    for (let i = 0; i < exportClause.namedChildCount; i++) {
      const spec = exportClause.namedChild(i);
      if (!spec || spec.type !== 'export_specifier') continue;
      const first = spec.namedChild(0);
      if (first) names.push(first.text);
    }
  } else if (namespaceExport) {
    names.push('*');
  } else {
    // `export * from '...'` — bare re-export
    names.push('*');
  }

  return {
    source,
    resolvedPath: null,
    importedNames: names,
    isTypeOnly,
    kind: 'reexport',
  };
};

/**
 * Walk the tree once looking for `require('...')` call expressions.
 * Only top-level and simple direct calls are captured; that's the common
 * CommonJS pattern.
 */
const extractRequireCalls = (root: Parser.SyntaxNode): ImportRef[] => {
  const out: ImportRef[] = [];

  const visit = (n: Parser.SyntaxNode): void => {
    if (n.type === 'call_expression') {
      const callee = n.namedChild(0);
      if (callee && callee.type === 'identifier' && callee.text === 'require') {
        const args = findChildByType(n, 'arguments');
        if (args) {
          const first = args.namedChild(0);
          const src = stringLiteralValue(first);
          if (src !== null) {
            out.push({
              source: src,
              resolvedPath: null,
              importedNames: [],
              isTypeOnly: false,
              kind: 'require',
            });
          }
        }
      }
    }
    for (let i = 0; i < n.namedChildCount; i++) {
      const c = n.namedChild(i);
      if (c) visit(c);
    }
  };

  visit(root);
  return out;
};

// ---------- symbol extraction ----------

interface SymbolExtractionContext {
  filePath: string;
  symbols: CodeSymbol[];
}

const pushSymbol = (
  ctx: SymbolExtractionContext,
  kind: SymbolKind,
  nameNode: Parser.SyntaxNode | null,
  targetNode: Parser.SyntaxNode,
  exported: boolean,
): void => {
  if (!nameNode) return;
  const loc = locationOf(targetNode);
  ctx.symbols.push({
    id: symbolIdOf(ctx.filePath, kind, nameNode.text, loc.startLine),
    name: nameNode.text,
    kind,
    location: loc,
    exported,
  });
};

const NAME_ID_TYPES = ['identifier', 'type_identifier', 'property_identifier'] as const;

const nameOf = (node: Parser.SyntaxNode): Parser.SyntaxNode | null =>
  findChildByTypes(node, NAME_ID_TYPES);

/** Handle a `lexical_declaration` (const/let) or `variable_declaration` (var). */
const extractVariableDeclaration = (
  decl: Parser.SyntaxNode,
  exported: boolean,
  ctx: SymbolExtractionContext,
): void => {
  const isConst = hasAnonChild(decl, 'const');
  const kind: SymbolKind = isConst ? 'constant' : 'variable';

  for (let i = 0; i < decl.namedChildCount; i++) {
    const dtor = decl.namedChild(i);
    if (!dtor || dtor.type !== 'variable_declarator') continue;
    // The declarator's first child is either an identifier (plain), an
    // object_pattern, or an array_pattern. Only the identifier form yields
    // a clean single symbol; destructuring is intentionally skipped in
    // Phase 2 to avoid ambiguity in the file inspector.
    const name = dtor.namedChild(0);
    if (name && name.type === 'identifier') {
      pushSymbol(ctx, kind, name, dtor, exported);
    }
  }
};

/**
 * Handle a declaration node (function/class/interface/enum/type-alias/variable).
 * Called from both top-level position and inside `export_statement`.
 */
const extractDeclaration = (
  decl: Parser.SyntaxNode,
  exported: boolean,
  ctx: SymbolExtractionContext,
): void => {
  switch (decl.type) {
    case 'function_declaration':
    case 'generator_function_declaration': {
      pushSymbol(ctx, 'function', nameOf(decl), decl, exported);
      return;
    }
    case 'class_declaration': {
      pushSymbol(ctx, 'class', nameOf(decl), decl, exported);
      return;
    }
    case 'interface_declaration': {
      pushSymbol(ctx, 'interface', nameOf(decl), decl, exported);
      return;
    }
    case 'enum_declaration': {
      pushSymbol(ctx, 'enum', nameOf(decl), decl, exported);
      return;
    }
    case 'type_alias_declaration': {
      pushSymbol(ctx, 'type-alias', nameOf(decl), decl, exported);
      return;
    }
    case 'lexical_declaration':
    case 'variable_declaration': {
      extractVariableDeclaration(decl, exported, ctx);
      return;
    }
    default:
      return;
  }
};

/**
 * `export_statement` variants:
 *   - export <decl>
 *   - export default <decl-or-expr>
 *   - export { a, b } from '...'    → re-export (handled separately)
 *   - export { a, b }               → re-export of local names (no source)
 *   - export * from '...'           → re-export
 */
const extractExportStatement = (
  node: Parser.SyntaxNode,
  ctx: SymbolExtractionContext,
): void => {
  // If it has a `string` child, it's a re-export form; nothing new to add here.
  if (findChildByType(node, 'string')) return;

  const isDefault = hasAnonChild(node, 'default');
  // Look for a declaration child.
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (!c) continue;
    if (
      c.type === 'function_declaration' ||
      c.type === 'generator_function_declaration' ||
      c.type === 'class_declaration' ||
      c.type === 'interface_declaration' ||
      c.type === 'enum_declaration' ||
      c.type === 'type_alias_declaration' ||
      c.type === 'lexical_declaration' ||
      c.type === 'variable_declaration'
    ) {
      extractDeclaration(c, true, ctx);
      return;
    }
  }

  // `export default <expr>` (e.g. an object literal, identifier, arrow fn).
  // Only anonymous default exports get a synthetic 'default' entry.
  if (isDefault) {
    ctx.symbols.push({
      id: symbolIdOf(ctx.filePath, 'variable', 'default', node.startPosition.row + 1),
      name: 'default',
      kind: 'variable',
      location: locationOf(node),
      exported: true,
    });
  }
};

// ---------- entry point ----------

export interface ExtractionResult {
  imports: ImportRef[];
  symbols: CodeSymbol[];
}

export const extractSymbolsAndImports = (
  filePath: string,
  root: Parser.SyntaxNode,
): ExtractionResult => {
  const ctx: SymbolExtractionContext = { filePath, symbols: [] };
  const imports: ImportRef[] = [];

  // Walk only the top-level `program` children.
  for (let i = 0; i < root.namedChildCount; i++) {
    const stmt = root.namedChild(i);
    if (!stmt) continue;

    switch (stmt.type) {
      case 'import_statement': {
        const imp = extractImportStatement(stmt);
        if (imp) imports.push(imp);
        break;
      }
      case 'export_statement': {
        const reexport = extractReexportStatement(stmt);
        if (reexport) imports.push(reexport);
        extractExportStatement(stmt, ctx);
        break;
      }
      default:
        extractDeclaration(stmt, false, ctx);
        break;
    }
  }

  // require() calls can appear anywhere; walk deeply.
  imports.push(...extractRequireCalls(root));

  return { imports, symbols: ctx.symbols };
};
