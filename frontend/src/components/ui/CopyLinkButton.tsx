import { useCallback, useState } from 'react';
import { Button } from './Button';

interface CopyLinkButtonProps {
  /** Absolute or root-relative path to copy, e.g. `/graph/<id>`. */
  path: string;
  label?: string;
  copiedLabel?: string;
}

/**
 * CopyLinkButton — copies a shareable absolute URL for the current analysis.
 *
 * Uses `navigator.clipboard` when available, falling back to a transient
 * textarea + `document.execCommand('copy')` for older browsers / insecure
 * contexts. Visual feedback lasts ~1.8s.
 */
export const CopyLinkButton = ({
  path,
  label = 'Copy link',
  copiedLabel = 'Copied',
}: CopyLinkButtonProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const absolute = new URL(path, window.location.origin).toString();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absolute);
      } else {
        const ta = document.createElement('textarea');
        ta.value = absolute;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Swallow — a failed clipboard write is not worth a toast in Phase 4.
    }
  }, [path]);

  return (
    <Button
      variant="ghost"
      size="md"
      onClick={handleCopy}
      aria-live="polite"
      aria-label={copied ? copiedLabel : label}
    >
      {copied ? copiedLabel : label}
    </Button>
  );
};
