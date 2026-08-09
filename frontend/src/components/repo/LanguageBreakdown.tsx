import { GlassCard } from '../ui/GlassCard';
import type { LanguageStat } from '../../types/repository';

interface LanguageBreakdownProps {
  languages: LanguageStat[];
}

/**
 * Deterministic language color palette. Not a real GitHub-style palette;
 * just enough differentiation for the bars.
 */
const PALETTE = [
  '#7c5cff',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#14b8a6',
  '#a855f7',
  '#eab308',
  '#22c55e',
];

const colorFor = (index: number): string => {
  return PALETTE[index % PALETTE.length] ?? '#7c5cff';
};

export const LanguageBreakdown = ({ languages }: LanguageBreakdownProps) => {
  if (languages.length === 0) {
    return (
      <GlassCard>
        <div className="text-sm text-white/60">No files were detected in this repository.</div>
      </GlassCard>
    );
  }

  const top = languages.slice(0, 8);

  return (
    <GlassCard>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-white/90">Language breakdown</h2>
        <span className="text-xs text-white/40">{languages.length} categories</span>
      </div>

      <div className="mt-5 flex h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
        {top.map((lang, idx) => (
          <div
            key={lang.name}
            className="h-full"
            style={{
              width: `${lang.percent}%`,
              backgroundColor: colorFor(idx),
            }}
            title={`${lang.name} · ${lang.percent}%`}
          />
        ))}
      </div>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {top.map((lang, idx) => (
          <li
            key={lang.name}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex items-center gap-2 text-white/80">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: colorFor(idx) }}
              />
              {lang.name}
            </span>
            <span className="tabular-nums text-white/50">
              {lang.fileCount.toLocaleString()} · {lang.percent}%
            </span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
};
