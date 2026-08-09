import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { fixture } from '../../../__tests__/fixtures';
import { buildNeighborIndex, findFilesInCycles } from '../../../lib/graphCycles';

/**
 * We stub `computeLayout` so the test does not depend on ELK's async WebWorker
 * bundle. The stub returns positions in a simple grid — enough for React Flow
 * to render, memoize, and hook up event handlers.
 */
vi.mock('../../../lib/graphLayout', () => ({
  computeLayout: async (nodes: Array<{ id: string; width: number; height: number }>) => ({
    nodes: nodes.map((n, i) => ({ ...n, x: (i % 3) * 260, y: Math.floor(i / 3) * 100 })),
    width: 800,
    height: 400,
  }),
}));

// React Flow requires a sized container. jsdom returns 0 for
// getBoundingClientRect by default. Provide a stub.
beforeEach(() => {
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      width: 1024,
      height: 768,
      top: 0,
      left: 0,
      right: 1024,
      bottom: 768,
      toJSON: () => ({}),
    } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  };
});

const importComponent = async () => (await import('../DependencyGraph')).DependencyGraph;

describe('DependencyGraph', () => {
  it('renders a node for each file in the graph', async () => {
    const DependencyGraph = await importComponent();
    const neighborIndex = buildNeighborIndex(fixture.edges);
    const cycles = findFilesInCycles(fixture);

    render(
      <div style={{ width: 1024, height: 768 }}>
        <DependencyGraph
          graph={fixture}
          neighborIndex={neighborIndex}
          filesInCycles={cycles}
          selectedFilePath={null}
          onSelectFile={vi.fn()}
        />
      </div>,
    );

    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument();
      expect(screen.getByText('auth.ts')).toBeInTheDocument();
      expect(screen.getByText('utils.ts')).toBeInTheDocument();
    });
  });

  it('fires onSelectFile when a node is clicked', async () => {
    const DependencyGraph = await importComponent();
    const onSelectFile = vi.fn();
    const neighborIndex = buildNeighborIndex(fixture.edges);

    render(
      <div style={{ width: 1024, height: 768 }}>
        <DependencyGraph
          graph={fixture}
          neighborIndex={neighborIndex}
          filesInCycles={findFilesInCycles(fixture)}
          selectedFilePath={null}
          onSelectFile={onSelectFile}
        />
      </div>,
    );

    // Wait for nodes to render.
    const authNode = await waitFor(() => screen.getByText('auth.ts'));
    // Click on the node body — bubble up to React Flow.
    fireEvent.click(authNode);

    await waitFor(() => {
      expect(onSelectFile).toHaveBeenCalledWith('src/auth.ts');
    });
  });

  it('applies the "selected" aria state to the currently selected node', async () => {
    const DependencyGraph = await importComponent();
    const neighborIndex = buildNeighborIndex(fixture.edges);

    render(
      <div style={{ width: 1024, height: 768 }}>
        <DependencyGraph
          graph={fixture}
          neighborIndex={neighborIndex}
          filesInCycles={findFilesInCycles(fixture)}
          selectedFilePath="src/auth.ts"
          onSelectFile={vi.fn()}
        />
      </div>,
    );

    await waitFor(() => {
      // Match exactly the aria-label for src/auth.ts (3 symbols) — not auth.test.ts.
      const selected = screen.getByRole('button', { name: 'auth.ts, TypeScript, 3 symbols' });
      expect(selected.getAttribute('aria-selected')).toBe('true');
    });
  });

  it('filters visible nodes when "hide test files" is toggled', async () => {
    const DependencyGraph = await importComponent();
    const neighborIndex = buildNeighborIndex(fixture.edges);

    render(
      <div style={{ width: 1024, height: 768 }}>
        <DependencyGraph
          graph={fixture}
          neighborIndex={neighborIndex}
          filesInCycles={findFilesInCycles(fixture)}
          selectedFilePath={null}
          onSelectFile={vi.fn()}
        />
      </div>,
    );

    await waitFor(() => {
      expect(screen.getByText('auth.test.ts')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByLabelText(/hide test files/i));

    await waitFor(() => {
      expect(screen.queryByText('auth.test.ts')).toBeNull();
    });
  });

  it('centers the graph on search matches — search does not hide non-matches', async () => {
    const DependencyGraph = await importComponent();
    const neighborIndex = buildNeighborIndex(fixture.edges);

    render(
      <div style={{ width: 1024, height: 768 }}>
        <DependencyGraph
          graph={fixture}
          neighborIndex={neighborIndex}
          filesInCycles={findFilesInCycles(fixture)}
          selectedFilePath={null}
          onSelectFile={vi.fn()}
        />
      </div>,
    );

    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/search files/i), {
      target: { value: 'cycle' },
    });

    // index.ts is still visible; cycle files are visible too.
    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument();
      expect(screen.getByText('cycle-a.ts')).toBeInTheDocument();
    });
  });
});
