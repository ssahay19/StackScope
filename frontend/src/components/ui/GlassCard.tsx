import type { HTMLAttributes, ReactNode } from 'react';

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  as?: 'div' | 'section' | 'article';
  padded?: boolean;
}

const cn = (...classes: Array<string | false | undefined>): string =>
  classes.filter(Boolean).join(' ');

export const GlassCard = ({
  children,
  as: Tag = 'div',
  padded = true,
  className,
  ...rest
}: GlassCardProps) => (
  <Tag
    className={cn(
      'glass rounded-2xl',
      padded && 'p-6 sm:p-8',
      className,
    )}
    {...rest}
  >
    {children}
  </Tag>
);
