import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost';
type Size = 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  leftIcon?: ReactNode;
}

const cn = (...classes: Array<string | false | undefined>): string =>
  classes.filter(Boolean).join(' ');

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 select-none whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-white shadow-glow hover:bg-accent/90 active:scale-[0.98]',
  ghost:
    'bg-white/[0.03] text-white/80 border border-white/10 hover:bg-white/[0.06] hover:text-white',
};

const sizes: Record<Size, string> = {
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-[15px]',
};

export const Button = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) => (
  <button
    type={type}
    disabled={disabled ?? isLoading}
    className={cn(base, variants[variant], sizes[size], className)}
    aria-busy={isLoading}
    {...rest}
  >
    {isLoading ? (
      <span
        className="inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"
        aria-hidden
      />
    ) : (
      leftIcon
    )}
    <span>{children}</span>
  </button>
);
