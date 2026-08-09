import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GraphToolbar, emptyFilters } from '../GraphToolbar';

const noop = () => {};

const setup = (overrides: Partial<React.ComponentProps<typeof GraphToolbar>> = {}) => {
  const props: React.ComponentProps<typeof GraphToolbar> = {
    search: '',
    onSearchChange: vi.fn(),
    filters: emptyFilters(),
    onFiltersChange: vi.fn(),
    availableLanguages: ['TypeScript', 'JavaScript'],
    availableFolders: ['src', 'test'],
    matchCount: 10,
    totalCount: 15,
    ...overrides,
  };
  render(<GraphToolbar {...props} />);
  return props;
};

describe('GraphToolbar', () => {
  it('shows a search input with placeholder', () => {
    setup();
    const input = screen.getByPlaceholderText(/search files/i);
    expect(input).toBeInTheDocument();
  });

  it('reports the visible / total count', () => {
    setup({ matchCount: 4, totalCount: 20 });
    expect(screen.getByText('4 / 20')).toBeInTheDocument();
  });

  it('calls onSearchChange when typing', () => {
    const onSearchChange = vi.fn();
    setup({ onSearchChange });
    fireEvent.change(screen.getByPlaceholderText(/search files/i), {
      target: { value: 'auth' },
    });
    expect(onSearchChange).toHaveBeenCalledWith('auth');
  });

  it('shows a clear button when search has a value and calls onSearchChange("")', () => {
    const onSearchChange = vi.fn();
    setup({ search: 'auth', onSearchChange });
    fireEvent.click(screen.getByLabelText(/clear search/i));
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('toggles the filters panel when the Filters button is clicked', () => {
    setup();
    // Filters panel is collapsed by default — the language chip is not visible.
    expect(screen.queryByRole('button', { name: 'TypeScript' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    expect(screen.getByRole('button', { name: 'TypeScript' })).toBeInTheDocument();
  });

  it('emits a new filters object when a language chip is toggled', () => {
    const onFiltersChange = vi.fn();
    setup({ onFiltersChange });
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(screen.getByRole('button', { name: 'TypeScript' }));
    expect(onFiltersChange).toHaveBeenCalled();
    const next = onFiltersChange.mock.calls[0]?.[0] as { languages: Set<string> };
    expect(next.languages.has('TypeScript')).toBe(true);
  });

  it('emits filter changes for the boolean toggles', () => {
    const onFiltersChange = vi.fn();
    setup({ onFiltersChange });
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(screen.getByLabelText(/only files with imports/i));
    const next = onFiltersChange.mock.calls[0]?.[0] as { onlyWithImports: boolean };
    expect(next.onlyWithImports).toBe(true);
  });

  it('shows a badge with the count of active filters', () => {
    setup({ filters: { ...emptyFilters(), hideTests: true, hideConfig: true } });
    // Two active filters → badge should show "2"
    expect(screen.getByRole('button', { name: /filters/i })).toHaveTextContent('2');
  });

  it('is safe to render with no languages/folders (empty repo)', () => {
    setup({ availableLanguages: [], availableFolders: [] });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    });
    expect(screen.getByText(/none detected/i)).toBeInTheDocument();
    expect(screen.getByText(/repository is flat/i)).toBeInTheDocument();
  });
});

// unused import guard — keep tsc happy in strict mode.
void noop;
