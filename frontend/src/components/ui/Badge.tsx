import type { ReactNode } from 'react';

type Tone = 'neutral' | 'accent' | 'positive' | 'warning' | 'danger';

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}

const tones: Record<Tone, string> = {
  neutral: 'bg-white/[0.04] text-white/80 border-white/10',
  accent: 'bg-accent/15 text-accent-soft border-accent/30',
  positive: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  danger: 'bg-red-500/10 text-red-300 border-red-500/20',
};

export const Badge = ({ children, tone = 'neutral', className }: BadgeProps) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className ?? ''}`}
  >
    {children}
  </span>
);
