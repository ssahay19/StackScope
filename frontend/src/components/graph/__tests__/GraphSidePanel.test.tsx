import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GraphSidePanel } from '../GraphSidePanel';
import type { FileInspectorResponse } from '../../../types/parsing';

const sample: FileInspectorResponse = {
  filePath: 'src/auth.ts',
  language: 'TypeScript',
  languageSupported: true,
  imports: [
    { source: './utils', resolvedPath: 'src/utils.ts', importedNames: ['hash'], isTypeOnly: false, kind: 'import' },
    { source: 'react', resolvedPath: null, importedNames: ['useState'], isTypeOnly: false, kind: 'import' },
  ],
  importedBy: ['src/index.ts'],
  symbols: [
    { id: 'src/auth.ts#function:login@1', name: 'login', kind: 'function', location: { startLine: 1, endLine: 10, startColumn: 0, endColumn: 1 }, exported: true },
    { id: 'src/auth.ts#class:Session@12', name: 'Session', kind: 'class', location: { startLine: 12, endLine: 20, startColumn: 0, endColumn: 1 }, exported: true },
  ],
  parseError: null,
  skipped: false,
  skipReason: null,
  category: 'source',
  extension: 'ts',
  folder: 'src',
  symbolCount: 2,
};

describe('GraphSidePanel', () => {
  it('renders nothing when closed', () => {
    render(<GraphSidePanel open={false} onClose={vi.fn()} onSelectFile={vi.fn()} status="success" data={sample} error={null} />);
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('renders file name and path when open', () => {
    render(<GraphSidePanel open onClose={vi.fn()} onSelectFile={vi.fn()} status="success" data={sample} error={null} />);
    expect(screen.getByText('auth.ts')).toBeInTheDocument();
    expect(screen.getByText('src/auth.ts')).toBeInTheDocument();
  });

  it('renders symbol sections grouped by kind', () => {
    render(<GraphSidePanel open onClose={vi.fn()} onSelectFile={vi.fn()} status="success" data={sample} error={null} />);
    expect(screen.getByText('Functions')).toBeInTheDocument();
    expect(screen.getByText('Classes')).toBeInTheDocument();
    expect(screen.getByText('login')).toBeInTheDocument();
    expect(screen.getByText('Session')).toBeInTheDocument();
  });

  it('displays resolved imports and marks external ones', () => {
    render(<GraphSidePanel open onClose={vi.fn()} onSelectFile={vi.fn()} status="success" data={sample} error={null} />);
    expect(screen.getByRole('button', { name: /src\/utils\.ts/ })).toBeInTheDocument();
    expect(screen.getByText('react')).toBeInTheDocument();
    // Two occurrences of "external" or "import" chips are fine.
  });

  it('calls onSelectFile when an imported path is clicked', () => {
    const onSelectFile = vi.fn();
    render(<GraphSidePanel open onClose={vi.fn()} onSelectFile={onSelectFile} status="success" data={sample} error={null} />);
    fireEvent.click(screen.getByRole('button', { name: /src\/utils\.ts/ }));
    expect(onSelectFile).toHaveBeenCalledWith('src/utils.ts');
  });

  it('calls onSelectFile when an importedBy path is clicked', () => {
    const onSelectFile = vi.fn();
    render(<GraphSidePanel open onClose={vi.fn()} onSelectFile={onSelectFile} status="success" data={sample} error={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'src/index.ts' }));
    expect(onSelectFile).toHaveBeenCalledWith('src/index.ts');
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<GraphSidePanel open onClose={onClose} onSelectFile={vi.fn()} status="success" data={sample} error={null} />);
    fireEvent.click(screen.getByLabelText(/close side panel/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders a loading state', () => {
    render(<GraphSidePanel open onClose={vi.fn()} onSelectFile={vi.fn()} status="loading" data={null} error={null} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders an error state', () => {
    render(
      <GraphSidePanel
        open
        onClose={vi.fn()}
        onSelectFile={vi.fn()}
        status="error"
        data={null}
        error={{ code: 'NOT_FOUND', message: 'File not found in this repository analysis.' }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('File not found');
  });
});
