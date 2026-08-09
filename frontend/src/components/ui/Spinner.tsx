interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

export const Spinner = ({ size = 20, className, label = 'Loading' }: SpinnerProps) => (
  <span
    role="status"
    aria-label={label}
    className={`inline-block rounded-full border-2 border-white/25 border-t-white/90 animate-spin ${className ?? ''}`}
    style={{ width: size, height: size }}
  />
);
