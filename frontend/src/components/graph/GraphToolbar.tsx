import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useRef, useState } from 'react';
import type { NodeCategory } from '../../types/parsing';

/**
 * GraphFilters — all filter state lives in one place so the graph memoization
 * has a single dependency to key off.
 */
export interface GraphFilters {
  languages: Set<string>; // empty set = all languages
  folders: Set<string>; // empty set = all folders
  categories: Set<NodeCategory>; // empty set = all categories
  onlyWithImports: boolean;
  onlyRoots: boolean; // files with no incoming dependencies
  onlyCircular: boolean;
  hideTests: boolean;
  hideConfig: boolean;
}

export const emptyFilters = (): GraphFilters => ({
  languages: new Set(),
  folders: new Set(),
  categories: new Set(),
  onlyWithImports: false,
  onlyRoots: false,
  onlyCircular: false,
  hideTests: false,
  hideConfig: false,
});

interface GraphToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: GraphFilters;
  onFiltersChange: (filters: GraphFilters) => void;
  availableLanguages: string[];
  availableFolders: string[];
  matchCount: number;
  totalCount: number;
}

const Toggle = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <label className="flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1 text-sm text-white/80 hover:bg-white/[0.03]">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-3.5 w-3.5 rounded border-white/30 bg-white/5 accent-accent"
    />
    <span>{label}</span>
  </label>
);

const Chip = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={[
      'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
      active
        ? 'border-accent/60 bg-accent/15 text-accent-soft'
        : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white/90',
    ].join(' ')}
  >
    {label}
  </button>
);

export const GraphToolbar = ({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  availableLanguages,
  availableFolders,
  matchCount,
  totalCount,
}: GraphToolbarProps) => {
  const [showFilters, setShowFilters] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const toggleSet = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    n += filters.languages.size;
    n += filters.folders.size;
    if (filters.onlyWithImports) n += 1;
    if (filters.onlyRoots) n += 1;
    if (filters.onlyCircular) n += 1;
    if (filters.hideTests) n += 1;
    if (filters.hideConfig) n += 1;
    return n;
  }, [filters]);

  return (
    <div className="glass w-[min(720px,calc(100vw-2rem))] rounded-2xl p-2 shadow-glass">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-white/[0.02] px-3 py-2">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-white/40" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files — try 'auth', 'index', or a folder name"
            aria-label="Search files in the graph"
            className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
          />
          {search ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                onSearchChange('');
                searchRef.current?.focus();
              }}
              className="rounded p-0.5 text-white/40 hover:bg-white/[0.05] hover:text-white/70"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
                <path
                  d="M6 6l12 12M18 6l-12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>

        <span className="hidden shrink-0 text-xs tabular-nums text-white/50 sm:inline">
          {matchCount} / {totalCount}
        </span>

        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className={[
            'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors',
            showFilters || activeFilterCount > 0
              ? 'border-accent/50 bg-accent/10 text-accent-soft'
              : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:text-white/90',
          ].join(' ')}
        >
          Filters
          {activeFilterCount > 0 ? (
            <span className="rounded-full bg-accent/20 px-1.5 text-[10px] font-semibold tabular-nums text-accent-soft">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {showFilters ? (
          <motion.div
            key="filters"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] px-1 pt-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                    Language
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {availableLanguages.length === 0 ? (
                      <span className="text-xs text-white/40">None detected.</span>
                    ) : (
                      availableLanguages.map((lang) => (
                        <Chip
                          key={lang}
                          label={lang}
                          active={filters.languages.has(lang)}
                          onClick={() =>
                            onFiltersChange({
                              ...filters,
                              languages: toggleSet(filters.languages, lang),
                            })
                          }
                        />
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                    Top-level folder
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {availableFolders.length === 0 ? (
                      <span className="text-xs text-white/40">Repository is flat.</span>
                    ) : (
                      availableFolders.map((folder) => (
                        <Chip
                          key={folder}
                          label={folder || '/'}
                          active={filters.folders.has(folder)}
                          onClick={() =>
                            onFiltersChange({
                              ...filters,
                              folders: toggleSet(filters.folders, folder),
                            })
                          }
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-1 border-t border-white/[0.06] pt-3 sm:grid-cols-2 md:grid-cols-3">
                <Toggle
                  label="Only files with imports"
                  checked={filters.onlyWithImports}
                  onChange={(v) => onFiltersChange({ ...filters, onlyWithImports: v })}
                />
                <Toggle
                  label="Only files with no incoming"
                  checked={filters.onlyRoots}
                  onChange={(v) => onFiltersChange({ ...filters, onlyRoots: v })}
                />
                <Toggle
                  label="Only circular dependencies"
                  checked={filters.onlyCircular}
                  onChange={(v) => onFiltersChange({ ...filters, onlyCircular: v })}
                />
                <Toggle
                  label="Hide test files"
                  checked={filters.hideTests}
                  onChange={(v) => onFiltersChange({ ...filters, hideTests: v })}
                />
                <Toggle
                  label="Hide configuration files"
                  checked={filters.hideConfig}
                  onChange={(v) => onFiltersChange({ ...filters, hideConfig: v })}
                />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
