import type { ReactNode } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Spinner } from '../ui/Spinner';
import { Button } from '../ui/Button';
import type { ArchitectureInsights } from '../../types/insights';
import type { InsightsError, InsightsStatus } from '../../hooks/useArchitectureInsights';

interface ArchitectureInsightsPanelProps {
  status: InsightsStatus;
  insights: ArchitectureInsights | null;
  error: InsightsError | null;
  onReload: () => void;
  /** Optional: clicking a listed file selects it in the tree/graph. */
  onSelectFile?: (filePath: string) => void;
}

const FileButton = ({
  path,
  onSelect,
  children,
}: {
  path: string;
  onSelect?: (filePath: string) => void;
  children?: ReactNode;
}) => {
  if (!onSelect) {
    return (
      <span className="font-mono text-[13px] text-white/80 break-all">{path}</span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(path)}
      className="font-mono text-left text-[13px] text-sky-200/90 break-all hover:text-sky-100 hover:underline"
    >
      {children ?? path}
    </button>
  );
};

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h3 className="text-xs uppercase tracking-wider text-white/40">{children}</h3>
);

export const ArchitectureInsightsPanel = ({
  status,
  insights,
  error,
  onReload,
  onSelectFile,
}: ArchitectureInsightsPanelProps) => {
  if (status === 'loading' || status === 'idle') {
    return (
      <GlassCard>
        <div className="flex items-center gap-3 text-sm text-white/60">
          <Spinner size={14} /> Computing architecture insights…
        </div>
      </GlassCard>
    );
  }

  if (status === 'error' || !insights) {
    return (
      <GlassCard>
        <div className="text-sm font-medium text-red-200">Could not load insights</div>
        <p className="mt-1 text-sm text-white/50">{error?.message ?? 'Unknown error'}</p>
        <div className="mt-3">
          <Button size="md" variant="ghost" onClick={onReload}>
            Try again
          </Button>
        </div>
      </GlassCard>
    );
  }

  const { summary, mostDependedOn, hubs, entryPoints, orphans, circularChains, dependencyDepth, moduleGroups } =
    insights;

  return (
    <GlassCard as="section" aria-label="Architecture Insights">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-white">Architecture Insights</h2>
        <p className="mt-1.5 text-sm text-white/55">
          {summary.totalFiles.toLocaleString()} files ·{' '}
          {summary.totalDependencies.toLocaleString()} dependencies
        </p>
        <p className="mt-0.5 text-sm text-white/45">
          {summary.circularChainCount.toLocaleString()} circular dependency chain
          {summary.circularChainCount === 1 ? '' : 's'} · {summary.rootCount.toLocaleString()} roots ·{' '}
          {summary.orphanCount.toLocaleString()} orphans
        </p>
        <p className="mt-1 text-xs text-white/35">
          Depth {dependencyDepth.maxDepth}
          {dependencyDepth.deepestPath.length > 0
            ? ` · deepest path ${dependencyDepth.deepestPath.length} files`
            : ''}
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Most depended-on</SectionTitle>
          {mostDependedOn.length === 0 ? (
            <p className="mt-2 text-sm text-white/40">None</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {mostDependedOn.map((row) => (
                <li key={row.filePath} className="flex items-baseline justify-between gap-3">
                  <FileButton path={row.filePath} onSelect={onSelectFile} />
                  <span className="shrink-0 text-xs tabular-nums text-white/45">
                    {row.dependents} dependent{row.dependents === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionTitle>Hub files</SectionTitle>
          {hubs.length === 0 ? (
            <p className="mt-2 text-sm text-white/40">None above threshold</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {hubs.map((row) => (
                <li key={row.filePath} className="flex items-baseline justify-between gap-3">
                  <FileButton path={row.filePath} onSelect={onSelectFile} />
                  <span className="shrink-0 text-xs tabular-nums text-white/45">
                    degree {row.totalDegree} (in {row.inDegree} / out {row.outDegree})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionTitle>Entry points</SectionTitle>
          {entryPoints.length === 0 ? (
            <p className="mt-2 text-sm text-white/40">None</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {entryPoints.slice(0, 15).map((row) => (
                <li key={row.filePath} className="flex items-baseline justify-between gap-3">
                  <FileButton path={row.filePath} onSelect={onSelectFile} />
                  <span className="shrink-0 text-xs tabular-nums text-white/45">
                    {row.outDegree} import{row.outDegree === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionTitle>Orphan files</SectionTitle>
          <p className="mt-1 text-[11px] leading-relaxed text-white/35">
            A file can look orphaned only because its language isn&apos;t parsed or its imports are
            dynamic.
          </p>
          {orphans.length === 0 ? (
            <p className="mt-2 text-sm text-white/40">None</p>
          ) : (
            <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
              {orphans.slice(0, 30).map((row) => (
                <li key={row.filePath}>
                  <FileButton path={row.filePath} onSelect={onSelectFile} />
                </li>
              ))}
              {orphans.length > 30 ? (
                <li className="text-xs text-white/35">+{orphans.length - 30} more</li>
              ) : null}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-white/[0.06] pt-6">
        <SectionTitle>Circular dependency chains</SectionTitle>
        {circularChains.length === 0 ? (
          <p className="mt-2 text-sm text-white/40">None detected</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {circularChains.map((chain) => (
              <li key={chain.id} className="text-sm text-white/70">
                {chain.files.map((f, i) => (
                  <span key={`${chain.id}-${f}-${i}`}>
                    {i > 0 ? <span className="mx-1 text-white/30">→</span> : null}
                    <FileButton path={f} onSelect={onSelectFile} />
                  </span>
                ))}
                {chain.files.length > 1 ? (
                  <>
                    <span className="mx-1 text-white/30">→</span>
                    <span className="font-mono text-[13px] text-white/40">
                      {chain.files[0]?.split('/').pop()}
                    </span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {dependencyDepth.deepestPath.length > 1 ? (
        <div className="mt-6 border-t border-white/[0.06] pt-6">
          <SectionTitle>Deepest dependency path</SectionTitle>
          <p className="mt-2 text-sm text-white/70">
            {dependencyDepth.deepestPath.map((f, i) => (
              <span key={`depth-${f}-${i}`}>
                {i > 0 ? <span className="mx-1 text-white/30">→</span> : null}
                <FileButton path={f} onSelect={onSelectFile} />
              </span>
            ))}
          </p>
        </div>
      ) : null}

      <div className="mt-6 border-t border-white/[0.06] pt-6">
        <SectionTitle>Module groups (top-level folder)</SectionTitle>
        {moduleGroups.length === 0 ? (
          <p className="mt-2 text-sm text-white/40">None</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-white/35">
                  <th className="pb-2 pr-4 font-normal">Folder</th>
                  <th className="pb-2 pr-4 font-normal tabular-nums">Files</th>
                  <th className="pb-2 pr-4 font-normal tabular-nums">Internal</th>
                  <th className="pb-2 pr-4 font-normal tabular-nums">Out</th>
                  <th className="pb-2 font-normal tabular-nums">In</th>
                </tr>
              </thead>
              <tbody>
                {moduleGroups.map((g) => (
                  <tr key={g.folder || '(root)'} className="border-t border-white/[0.04]">
                    <td className="py-1.5 pr-4 font-mono text-[13px] text-white/80">
                      {g.folder || '(root)'}
                    </td>
                    <td className="py-1.5 pr-4 tabular-nums text-white/55">{g.fileCount}</td>
                    <td className="py-1.5 pr-4 tabular-nums text-white/55">{g.internalEdges}</td>
                    <td className="py-1.5 pr-4 tabular-nums text-white/55">{g.outboundCrossEdges}</td>
                    <td className="py-1.5 tabular-nums text-white/55">{g.inboundCrossEdges}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </GlassCard>
  );
};
