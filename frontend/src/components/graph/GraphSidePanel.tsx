import { AnimatePresence, motion } from 'framer-motion';
import { basename } from '../../lib/paths';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { Button } from '../ui/Button';
import type {
  CodeSymbol,
  FileInspectorResponse,
  ImportRef,
  SymbolKind,
} from '../../types/parsing';
import type { FileImpact } from '../../types/impact';
import type { ImpactStatus } from '../../hooks/useFileImpact';
import type {
  ImpactExplainError,
  ImpactExplainStatus,
} from '../../hooks/useImpactExplain';

interface GraphSidePanelProps {
  open: boolean;
  onClose: () => void;
  onSelectFile: (path: string) => void;
  status: 'idle' | 'loading' | 'success' | 'error';
  data: FileInspectorResponse | null;
  error: { code: string; message: string } | null;
  /** Phase 7 change-impact */
  impactStatus?: ImpactStatus;
  impact?: FileImpact | null;
  impactError?: { code: string; message: string } | null;
  impactMode?: boolean;
  onToggleImpactMode?: () => void;
  explainStatus?: ImpactExplainStatus;
  explainText?: string | null;
  explainCached?: boolean;
  explainError?: ImpactExplainError | null;
  explainUnavailable?: string | null;
  onExplainImpact?: () => void;
}

const SYMBOL_KIND_LABELS: Record<SymbolKind, string> = {
  function: 'Functions',
  class: 'Classes',
  interface: 'Interfaces',
  enum: 'Enums',
  'type-alias': 'Type Aliases',
  constant: 'Constants',
  variable: 'Variables',
};

const SYMBOL_KIND_ORDER: SymbolKind[] = [
  'function',
  'class',
  'interface',
  'enum',
  'type-alias',
  'constant',
  'variable',
];

const groupSymbols = (symbols: CodeSymbol[]): Record<SymbolKind, CodeSymbol[]> => {
  const groups: Record<SymbolKind, CodeSymbol[]> = {
    function: [],
    class: [],
    interface: [],
    enum: [],
    'type-alias': [],
    constant: [],
    variable: [],
  };
  for (const s of symbols) groups[s.kind].push(s);
  return groups;
};

const Section = ({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) => (
  <div>
    <div className="flex items-baseline gap-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/45">{title}</div>
      {count !== undefined ? (
        <span className="text-[10px] tabular-nums text-white/35">{count}</span>
      ) : null}
    </div>
    <div className="mt-2">{children}</div>
  </div>
);

const ImportRow = ({ imp, onSelectFile }: { imp: ImportRef; onSelectFile: (p: string) => void }) => (
  <li className="flex items-start justify-between gap-2 rounded-md px-2 py-1 hover:bg-white/[0.02]">
    <div className="min-w-0">
      {imp.resolvedPath ? (
        <button
          type="button"
          onClick={() => onSelectFile(imp.resolvedPath as string)}
          className="truncate text-sm text-white/85 hover:text-white hover:underline"
        >
          {imp.resolvedPath}
        </button>
      ) : (
        <span className="truncate text-sm text-white/55">{imp.source}</span>
      )}
      {imp.importedNames.length > 0 ? (
        <div className="text-[11px] text-white/40">{imp.importedNames.join(', ')}</div>
      ) : null}
    </div>
    <span className="mt-0.5 shrink-0 text-[10px] uppercase tracking-wider text-white/35">
      {imp.resolvedPath ? imp.kind : 'external'}
    </span>
  </li>
);

export const GraphSidePanel = ({
  open,
  onClose,
  onSelectFile,
  status,
  data,
  error,
  impactStatus = 'idle',
  impact = null,
  impactError = null,
  impactMode = false,
  onToggleImpactMode,
  explainStatus = 'idle',
  explainText = null,
  explainCached = false,
  explainError = null,
  explainUnavailable = null,
  onExplainImpact,
}: GraphSidePanelProps) => (
  <AnimatePresence>
    {open ? (
      <motion.aside
        key="side"
        initial={{ x: 380, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 380, opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-auto absolute right-4 top-4 bottom-4 z-20 flex w-[360px] flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-elevated/95 backdrop-blur-xl shadow-glass"
        role="complementary"
        aria-label="File details"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] p-4">
          <div className="min-w-0">
            {data ? (
              <>
                <div className="truncate text-sm font-semibold text-white/95" title={data.filePath}>
                  {basename(data.filePath)}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-white/45" title={data.filePath}>
                  {data.filePath}
                </div>
              </>
            ) : (
              <div className="text-sm text-white/60">File details</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close side panel"
            className="rounded-md p-1 text-white/50 hover:bg-white/[0.05] hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
              <path
                d="M6 6l12 12M18 6l-12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {status === 'loading' ? (
            <div className="flex items-center gap-2 text-sm text-white/50">
              <Spinner size={14} /> Loading…
            </div>
          ) : status === 'error' && error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/[0.05] p-3 text-sm text-red-200" role="alert">
              {error.message}
            </div>
          ) : status === 'success' && data ? (
            <PanelContent
              data={data}
              onSelectFile={onSelectFile}
              impactStatus={impactStatus}
              impact={impact}
              impactError={impactError}
              impactMode={impactMode}
              onToggleImpactMode={onToggleImpactMode}
              explainStatus={explainStatus}
              explainText={explainText}
              explainCached={explainCached}
              explainError={explainError}
              explainUnavailable={explainUnavailable}
              onExplainImpact={onExplainImpact}
            />
          ) : null}
        </div>
      </motion.aside>
    ) : null}
  </AnimatePresence>
);

const PanelContent = ({
  data,
  onSelectFile,
  impactStatus,
  impact,
  impactError,
  impactMode,
  onToggleImpactMode,
  explainStatus,
  explainText,
  explainCached,
  explainError,
  explainUnavailable,
  onExplainImpact,
}: {
  data: FileInspectorResponse;
  onSelectFile: (p: string) => void;
  impactStatus: ImpactStatus;
  impact: FileImpact | null;
  impactError: { code: string; message: string } | null;
  impactMode: boolean;
  onToggleImpactMode?: () => void;
  explainStatus: ImpactExplainStatus;
  explainText: string | null;
  explainCached: boolean;
  explainError: ImpactExplainError | null;
  explainUnavailable: string | null;
  onExplainImpact?: () => void;
}) => {
  const groups = groupSymbols(data.symbols);
  const nonEmpty = SYMBOL_KIND_ORDER.filter((k) => groups[k].length > 0);
  const down = impact?.downstream;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/70">
              Change impact
            </div>
            {impactStatus === 'loading' ? (
              <p className="mt-1.5 flex items-center gap-2 text-sm text-white/50">
                <Spinner size={12} /> Computing blast radius…
              </p>
            ) : impactStatus === 'error' ? (
              <p className="mt-1.5 text-sm text-red-200/80">{impactError?.message}</p>
            ) : down ? (
              <>
                <p className="mt-1.5 text-sm text-white/85">
                  Changing this affects{' '}
                  <span className="font-semibold tabular-nums text-amber-100">
                    {down.total}
                  </span>{' '}
                  file{down.total === 1 ? '' : 's'}
                </p>
                <p className="mt-0.5 text-xs text-white/45">
                  {down.directCount} direct · {down.transitiveCount} transitive
                  {down.maxDistance > 0 ? ` · deepest ${down.maxDistance} hops` : ''}
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-sm text-white/50">No downstream dependents.</p>
            )}
          </div>
          {onToggleImpactMode ? (
            <Button
              size="md"
              variant="ghost"
              className="!px-2.5 !py-1 text-xs"
              aria-pressed={impactMode}
              onClick={onToggleImpactMode}
            >
              {impactMode ? 'Impact on' : 'Impact'}
            </Button>
          ) : null}
        </div>

        {down && down.files.length > 0 ? (
          <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto">
            {down.files.slice(0, 40).map((f) => (
              <li key={f.filePath} className="flex items-baseline justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectFile(f.filePath)}
                  className="truncate text-left font-mono text-[12px] text-amber-100/80 hover:text-amber-50 hover:underline"
                >
                  {f.filePath}
                </button>
                <span className="shrink-0 text-[10px] tabular-nums text-white/35">
                  {f.relation === 'direct' ? 'direct' : `d${f.distance}`}
                </span>
              </li>
            ))}
            {down.files.length > 40 ? (
              <li className="text-[11px] text-white/35">+{down.files.length - 40} more</li>
            ) : null}
          </ul>
        ) : null}

        {onExplainImpact ? (
          <div className="mt-3 border-t border-white/[0.06] pt-3">
            <Button
              size="md"
              variant="ghost"
              className="!px-2.5 !py-1 text-xs"
              isLoading={explainStatus === 'loading'}
              onClick={onExplainImpact}
              disabled={explainStatus === 'loading'}
            >
              {explainStatus === 'success' ? 'Explain again' : 'Explain impact'}
            </Button>
            {explainStatus === 'unavailable' ? (
              <p className="mt-2 text-xs text-amber-100/60">
                {explainUnavailable ?? 'AI is not configured on this server.'}
              </p>
            ) : null}
            {explainStatus === 'error' ? (
              <p className="mt-2 text-xs text-red-200/80">{explainError?.message}</p>
            ) : null}
            {explainStatus === 'success' && explainText ? (
              <div className="mt-2">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/70">
                  {explainText}
                </p>
                <p className="mt-1 text-[10px] text-white/35">
                  {explainCached ? 'Cached' : 'Fresh'} · AI over structured impact facts
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="accent">{data.language}</Badge>
        {data.parseError ? <Badge tone="warning">syntax errors</Badge> : null}
        {data.skipped ? <Badge tone="neutral">skipped</Badge> : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Imports" value={data.imports.length} />
        <StatTile label="Imported by" value={data.importedBy.length} />
        <StatTile label="Symbols" value={data.symbols.length} />
      </div>

      <Section title="Imports" count={data.imports.length}>
        {data.imports.length === 0 ? (
          <p className="text-sm text-white/40">No imports.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {data.imports.map((imp, i) => (
              <ImportRow key={`${imp.source}#${i}`} imp={imp} onSelectFile={onSelectFile} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Imported by" count={data.importedBy.length}>
        {data.importedBy.length === 0 ? (
          <p className="text-sm text-white/40">No files import this one.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {data.importedBy.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  onClick={() => onSelectFile(path)}
                  className="w-full truncate rounded-md px-2 py-1 text-left text-sm text-white/85 hover:bg-white/[0.02] hover:text-white"
                >
                  {path}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {nonEmpty.length === 0 ? null : (
        <div className="flex flex-col gap-4">
          {nonEmpty.map((k) => (
            <Section key={k} title={SYMBOL_KIND_LABELS[k]} count={groups[k].length}>
              <ul className="flex flex-col gap-0.5">
                {groups[k].map((s) => (
                  <li
                    key={s.id}
                    className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1 hover:bg-white/[0.02]"
                  >
                    <span className="truncate font-mono text-[13px] text-white/85">{s.name}</span>
                    <span className="shrink-0 text-[11px] text-white/40 tabular-nums">
                      L{s.location.startLine}
                      {s.exported ? <span className="ml-1.5 text-accent-soft">export</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
};

const StatTile = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
    <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
    <div className="mt-0.5 text-base font-semibold tabular-nums text-white/90">{value}</div>
  </div>
);
