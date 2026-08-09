import { AnimatePresence, motion } from 'framer-motion';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import type {
  CodeSymbol,
  FileInspectorResponse,
  ImportRef,
  SymbolKind,
} from '../../types/parsing';

interface FileInspectorProps {
  selectedPath: string | null;
  data: FileInspectorResponse | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: { code: string; message: string } | null;
  onSelectFile: (path: string) => void;
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

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] uppercase tracking-wider text-white/40">{children}</div>
);

const EmptyLine = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-2 text-sm text-white/40">{children}</p>
);

const skipReasonCopy: Record<string, string> = {
  'unsupported-language': 'Language not supported for parsing yet.',
  'too-large': 'File exceeds the configured size budget.',
  minified: 'Skipped because the file appears to be minified.',
  'ignored-path': 'Path is on the ignore list (build output, vendor code, etc.).',
  'read-error': 'File could not be read from disk.',
};

const ImportRow = ({
  imp,
  onSelectFile,
}: {
  imp: ImportRef;
  onSelectFile: (path: string) => void;
}) => {
  const chip =
    imp.kind === 'require' ? 'require' : imp.kind === 'reexport' ? 're-export' : 'import';
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-transparent px-2 py-1.5 hover:border-white/10 hover:bg-white/[0.02]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {imp.resolvedPath ? (
            <button
              type="button"
              onClick={() => onSelectFile(imp.resolvedPath as string)}
              className="truncate text-sm text-white/85 hover:text-white hover:underline"
              title={imp.resolvedPath}
            >
              {imp.resolvedPath}
            </button>
          ) : (
            <span className="truncate text-sm text-white/60" title={imp.source}>
              {imp.source}
            </span>
          )}
          {imp.isTypeOnly ? <Badge tone="neutral">type</Badge> : null}
        </div>
        {imp.importedNames.length > 0 ? (
          <div className="mt-0.5 text-xs text-white/45 tabular-nums">
            {imp.importedNames.join(', ')}
          </div>
        ) : null}
      </div>
      <span className="mt-0.5 shrink-0 text-[10px] uppercase tracking-wider text-white/35">
        {imp.resolvedPath ? chip : 'external'}
      </span>
    </li>
  );
};

const FilePill = ({
  path,
  onSelectFile,
}: {
  path: string;
  onSelectFile: (path: string) => void;
}) => (
  <li>
    <button
      type="button"
      onClick={() => onSelectFile(path)}
      className="w-full truncate rounded-lg border border-transparent px-2 py-1.5 text-left text-sm text-white/85 hover:border-white/10 hover:bg-white/[0.02] hover:text-white"
      title={path}
    >
      {path}
    </button>
  </li>
);

const SymbolGroup = ({ kind, items }: { kind: SymbolKind; items: CodeSymbol[] }) => {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <SectionHeading>{SYMBOL_KIND_LABELS[kind]}</SectionHeading>
        <span className="text-[11px] text-white/30 tabular-nums">{items.length}</span>
      </div>
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {items.map((s) => (
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
    </div>
  );
};

export const FileInspector = ({
  selectedPath,
  data,
  status,
  error,
  onSelectFile,
}: FileInspectorProps) => {
  return (
    <GlassCard>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-white/90">File Inspector</h2>
        {selectedPath ? (
          <span className="max-w-[60%] truncate text-xs text-white/40" title={selectedPath}>
            {selectedPath}
          </span>
        ) : (
          <span className="text-xs text-white/35">No file selected</span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {selectedPath === null ? (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-6"
          >
            <p className="text-sm text-white/50">
              Select a file from the tree to see its imports, incoming references, and exported
              symbols.
            </p>
          </motion.div>
        ) : status === 'loading' ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-6 flex items-center gap-3 text-sm text-white/50"
          >
            <Spinner size={14} /> Loading file details…
          </motion.div>
        ) : status === 'error' && error ? (
          <motion.div
            key={`err-${error.code}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-6 rounded-lg border border-red-500/30 bg-red-500/[0.05] p-4 text-sm text-red-200"
            role="alert"
          >
            {error.message}
          </motion.div>
        ) : status === 'success' && data ? (
          <motion.div
            key={data.filePath}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mt-5 flex flex-col gap-6"
          >
            <FileInspectorContent data={data} onSelectFile={onSelectFile} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </GlassCard>
  );
};

const FileInspectorContent = ({
  data,
  onSelectFile,
}: {
  data: FileInspectorResponse;
  onSelectFile: (path: string) => void;
}) => {
  const groups = groupSymbols(data.symbols);
  const nonEmpty = SYMBOL_KIND_ORDER.filter((k) => groups[k].length > 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{data.language}</Badge>
        {data.parseError ? <Badge tone="warning">syntax errors</Badge> : null}
        {data.skipped ? <Badge tone="neutral">skipped</Badge> : null}
      </div>

      {data.skipped && data.skipReason ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm text-white/60">
          {skipReasonCopy[data.skipReason] ?? 'File was not parsed.'}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="flex items-baseline gap-2">
            <SectionHeading>Outgoing (imports)</SectionHeading>
            <span className="text-[11px] text-white/30 tabular-nums">{data.imports.length}</span>
          </div>
          {data.imports.length === 0 ? (
            <EmptyLine>No imports.</EmptyLine>
          ) : (
            <ul className="mt-2 flex flex-col gap-0.5">
              {data.imports.map((imp, i) => (
                <ImportRow key={`${imp.source}#${i}`} imp={imp} onSelectFile={onSelectFile} />
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="flex items-baseline gap-2">
            <SectionHeading>Incoming (imported by)</SectionHeading>
            <span className="text-[11px] text-white/30 tabular-nums">{data.importedBy.length}</span>
          </div>
          {data.importedBy.length === 0 ? (
            <EmptyLine>No files import this one.</EmptyLine>
          ) : (
            <ul className="mt-2 flex flex-col gap-0.5">
              {data.importedBy.map((p) => (
                <FilePill key={p} path={p} onSelectFile={onSelectFile} />
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Outgoing" value={data.imports.filter((i) => i.resolvedPath).length} />
        <StatTile label="Incoming" value={data.importedBy.length} />
        <StatTile label="Symbols" value={data.symbols.length} />
      </div>

      {nonEmpty.length === 0 ? (
        <EmptyLine>No top-level symbols detected.</EmptyLine>
      ) : (
        <div className="flex flex-col gap-4">
          {nonEmpty.map((k) => (
            <SymbolGroup key={k} kind={k} items={groups[k]} />
          ))}
        </div>
      )}
    </>
  );
};

const StatTile = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
    <div className="text-[11px] uppercase tracking-wider text-white/40">{label}</div>
    <div className="mt-0.5 text-lg font-semibold text-white/90 tabular-nums">{value}</div>
  </div>
);
