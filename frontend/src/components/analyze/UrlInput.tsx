import { forwardRef, type InputHTMLAttributes } from 'react';

interface UrlInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  invalidMessage?: string | null;
}

export const UrlInput = forwardRef<HTMLInputElement, UrlInputProps>(
  ({ value, onChange, invalidMessage, disabled, placeholder, ...rest }, ref) => {
    const showError = Boolean(invalidMessage && value.trim().length > 0);

    return (
      <div className="w-full">
        <div
          className={[
            'flex items-center gap-2 rounded-xl border bg-white/[0.02] px-3.5 py-3 transition-colors',
            showError
              ? 'border-red-500/40 focus-within:border-red-500/60'
              : 'border-white/10 focus-within:border-accent/60',
          ].join(' ')}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-4 w-4 shrink-0 text-white/40"
            aria-hidden
          >
            <path
              d="M12 2C6.48 2 2 6.58 2 12.25c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.48v-1.7c-2.78.62-3.37-1.35-3.37-1.35-.45-1.17-1.1-1.48-1.1-1.48-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.35 1.12 2.92.85.09-.66.35-1.12.63-1.38-2.22-.26-4.55-1.14-4.55-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.05a9.4 9.4 0 0 1 5 0c1.9-1.32 2.74-1.05 2.74-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9v2.82c0 .27.18.59.69.48A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"
              fill="currentColor"
            />
          </svg>

          <input
            ref={ref}
            type="url"
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            placeholder={placeholder ?? 'https://github.com/vercel/next.js'}
            className="w-full bg-transparent text-[15px] text-white placeholder:text-white/30 focus:outline-none disabled:opacity-60"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-invalid={showError || undefined}
            aria-describedby={showError ? 'url-error' : undefined}
            {...rest}
          />
        </div>

        {showError && invalidMessage ? (
          <p id="url-error" className="mt-2 text-sm text-red-300/90">
            {invalidMessage}
          </p>
        ) : null}
      </div>
    );
  },
);

UrlInput.displayName = 'UrlInput';
