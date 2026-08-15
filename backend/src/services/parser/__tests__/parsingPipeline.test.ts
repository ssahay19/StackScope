import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runParsingPipeline } from '../parsingPipeline.js';
import type { TreeNode } from '../../../types/repository.js';

/**
 * Full-pipeline integration test.
 *
 * We build a small mixed JS/TS repo on disk, hand its tree to the pipeline,
 * and assert that the resulting graph is correct end-to-end.
 */

interface FixtureFile {
  path: string;
  content: string;
}

const buildTree = (root: string, files: FixtureFile[]): TreeNode => {
  const rootNode: TreeNode = { name: root, path: '', type: 'folder', children: [] };

  const ensureFolder = (parent: TreeNode, name: string, relPath: string): TreeNode => {
    parent.children ??= [];
    const existing = parent.children.find((c) => c.type === 'folder' && c.name === name);
    if (existing) return existing;
    const folder: TreeNode = { name, path: relPath, type: 'folder', children: [] };
    parent.children.push(folder);
    return folder;
  };

  for (const file of files) {
    const parts = file.path.split('/');
    const name = parts[parts.length - 1]!;
    let current = rootNode;
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]!;
      currentPath = currentPath ? `${currentPath}/${seg}` : seg;
      current = ensureFolder(current, seg, currentPath);
    }
    current.children ??= [];
    const idx = name.lastIndexOf('.');
    const ext = idx > 0 ? name.slice(idx + 1) : undefined;
    const node: TreeNode = {
      name,
      path: file.path,
      type: 'file',
      size: Buffer.byteLength(file.content),
    };
    if (ext) node.extension = ext;
    current.children.push(node);
  }

  return rootNode;
};

const writeFixture = async (root: string, files: FixtureFile[]): Promise<void> => {
  for (const file of files) {
    const abs = join(root, file.path);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, file.content, 'utf8');
  }
};

describe('parsingPipeline — integration', () => {
  let tmp: string;

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'stackscope-pipeline-test-'));
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('builds a graph from a mixed JS/TS repository', async () => {
    const files: FixtureFile[] = [
      { path: 'src/index.ts', content: `import { greet } from './greet';\nexport const app = greet('world');\n` },
      { path: 'src/greet.ts', content: `export function greet(name: string): string { return 'hi ' + name; }\n` },
      { path: 'src/util.js', content: `const path = require('path');\nfunction join(a, b) { return path.join(a, b); }\nmodule.exports = { join };\n` },
      { path: 'src/orphan.ts', content: `export const orphan = 1;\n` },
      { path: 'README.md', content: `# Readme` },
    ];
    await writeFixture(tmp, files);
    const tree = buildTree('example', files);

    const { graph, summary } = await runParsingPipeline({ clonedRoot: tmp, tree });

    // 5 files → 5 nodes; README is skipped (unsupported); others parsed.
    expect(graph.nodes).toHaveLength(5);
    expect(summary.filesSkipped).toBe(1);
    expect(summary.filesParsed).toBe(4);
    expect(summary.filesFailed).toBe(0);

    // index → greet edge exists.
    expect(graph.edges).toContainEqual({ from: 'src/index.ts', to: 'src/greet.ts' });
    expect(summary.totalEdges).toBe(1);

    // greet.ts is imported by index.ts
    const greet = graph.nodes.find((n) => n.filePath === 'src/greet.ts')!;
    expect(greet.importedBy).toEqual(['src/index.ts']);

    // README is marked unsupported and skipped.
    const readme = graph.nodes.find((n) => n.filePath === 'README.md')!;
    expect(readme.languageSupported).toBe(false);
    expect(readme.skipped).toBe(true);
    expect(readme.skipReason).toBe('unsupported-language');
  });

  it('detects a circular dependency between two files', async () => {
    const subdir = await mkdtemp(join(tmp, 'cycle-'));
    const files: FixtureFile[] = [
      { path: 'a.ts', content: `import { b } from './b';\nexport const a = b;\n` },
      { path: 'b.ts', content: `import { a } from './a';\nexport const b = a;\n` },
    ];
    await writeFixture(subdir, files);
    const tree = buildTree('cycle', files);

    const { summary } = await runParsingPipeline({ clonedRoot: subdir, tree });
    expect(summary.circularDependencies).toBe(1);
  });

  it('handles empty files and invalid syntax without crashing', async () => {
    const subdir = await mkdtemp(join(tmp, 'edge-'));
    const files: FixtureFile[] = [
      { path: 'empty.ts', content: '' },
      { path: 'invalid.ts', content: 'const x = ;;;' },
      { path: 'valid.ts', content: 'export const K = 1;' },
    ];
    await writeFixture(subdir, files);
    const tree = buildTree('edge', files);

    const { graph, summary } = await runParsingPipeline({ clonedRoot: subdir, tree });

    const emptyNode = graph.nodes.find((n) => n.filePath === 'empty.ts')!;
    const invalidNode = graph.nodes.find((n) => n.filePath === 'invalid.ts')!;
    const validNode = graph.nodes.find((n) => n.filePath === 'valid.ts')!;

    expect(emptyNode.symbols).toHaveLength(0);
    expect(emptyNode.parseError).toBeNull();

    // The invalid file yields hasErrors → parseError message. It still parsed.
    expect(invalidNode.parseError).toBeTruthy();
    expect(invalidNode.skipped).toBe(false);

    expect(validNode.symbols).toHaveLength(1);
    expect(validNode.symbols[0]?.name).toBe('K');

    expect(summary.filesFailed + summary.filesParsed).toBe(3);
  });

  it('skips minified files', async () => {
    const subdir = await mkdtemp(join(tmp, 'mini-'));
    const files: FixtureFile[] = [
      { path: 'lib.min.js', content: 'var a=1;' },
      { path: 'lib.js', content: 'const a = 1;' },
    ];
    await writeFixture(subdir, files);
    const tree = buildTree('mini', files);

    const { graph } = await runParsingPipeline({ clonedRoot: subdir, tree });
    const min = graph.nodes.find((n) => n.filePath === 'lib.min.js')!;
    expect(min.skipped).toBe(true);
    expect(min.skipReason).toBe('minified');
  });

  it('parses Python packages and resolves intra-repo imports (Phase 5A)', async () => {
    const subdir = await mkdtemp(join(tmp, 'py-'));
    const files: FixtureFile[] = [
      {
        path: 'pkg/__init__.py',
        content: `from .util import helper\nfrom .sub import nest\n`,
      },
      {
        path: 'pkg/util.py',
        content: `def helper():\n    return 42\n\nclass Util:\n    pass\n`,
      },
      {
        path: 'pkg/sub/__init__.py',
        content: `from .nest import nest\n`,
      },
      {
        path: 'pkg/sub/nest.py',
        content: `def nest():\n    return 'nested'\n`,
      },
      {
        path: 'main.py',
        content: `import pkg.util\nfrom pkg.sub import nest\nimport os\n`,
      },
      { path: 'README.md', content: '# py fixture' },
    ];
    await writeFixture(subdir, files);
    const tree = buildTree('pypkg', files);

    const { graph, summary } = await runParsingPipeline({ clonedRoot: subdir, tree });

    expect(graph.nodes).toHaveLength(6);
    expect(summary.filesSkipped).toBe(1); // README
    expect(summary.filesParsed).toBe(5);
    expect(summary.filesFailed).toBe(0);

    // Absolute: main → pkg/util.py
    expect(graph.edges).toContainEqual({ from: 'main.py', to: 'pkg/util.py' });
    // Absolute package submodule: main → pkg/sub/nest.py (or sub/__init__ then nest)
    expect(
      graph.edges.some(
        (e) =>
          e.from === 'main.py' &&
          (e.to === 'pkg/sub/nest.py' || e.to === 'pkg/sub/__init__.py'),
      ),
    ).toBe(true);

    // Relative: pkg/__init__.py → pkg/util.py
    expect(graph.edges).toContainEqual({ from: 'pkg/__init__.py', to: 'pkg/util.py' });

    // os is external
    const main = graph.nodes.find((n) => n.filePath === 'main.py')!;
    expect(main.language).toBe('Python');
    expect(main.languageSupported).toBe(true);
    const osImp = main.imports.find((i) => i.source === 'os');
    expect(osImp?.resolvedPath).toBeNull();

    // Symbols on util.py
    const util = graph.nodes.find((n) => n.filePath === 'pkg/util.py')!;
    expect(util.symbols.map((s) => s.name).sort()).toEqual(['Util', 'helper']);
    expect(util.category).toBe('source');
  });

  it('resolves tsconfig path aliases into graph edges (Phase 5B)', async () => {
    const subdir = await mkdtemp(join(tmp, 'alias-'));
    const files: FixtureFile[] = [
      {
        path: 'tsconfig.json',
        content: `{
  // JSONC
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
  }
}
`,
      },
      {
        path: 'src/components/Button.tsx',
        content: `export function Button() { return null; }\n`,
      },
      {
        path: 'src/pages/home.ts',
        content: `import { Button } from '@/components/Button';\nimport React from 'react';\nexport const page = Button;\n`,
      },
    ];
    await writeFixture(subdir, files);
    const tree = buildTree('alias', files);

    const { graph, summary } = await runParsingPipeline({ clonedRoot: subdir, tree });

    expect(summary.filesFailed).toBe(0);
    expect(graph.edges).toContainEqual({
      from: 'src/pages/home.ts',
      to: 'src/components/Button.tsx',
    });

    const home = graph.nodes.find((n) => n.filePath === 'src/pages/home.ts')!;
    const aliasImp = home.imports.find((i) => i.source === '@/components/Button');
    expect(aliasImp?.resolvedPath).toBe('src/components/Button.tsx');
    const reactImp = home.imports.find((i) => i.source === 'react');
    expect(reactImp?.resolvedPath).toBeNull();
  });
});
