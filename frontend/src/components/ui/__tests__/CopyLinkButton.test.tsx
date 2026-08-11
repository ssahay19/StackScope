import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CopyLinkButton } from '../CopyLinkButton';

describe('CopyLinkButton', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copies an absolute URL derived from the path and shows confirmation', async () => {
    render(<CopyLinkButton path="/graph/abc-123" />);

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
      const arg = writeText.mock.calls[0]?.[0] as string;
      expect(arg).toMatch(/\/graph\/abc-123$/);
      expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();
      expect(screen.getByText('Copied')).toBeInTheDocument();
    });
  });

  it('supports a custom label', () => {
    render(<CopyLinkButton path="/result/abc-123" label="Share" />);
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });
});
