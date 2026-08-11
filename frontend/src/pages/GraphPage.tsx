import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { RepositoryAnalysis } from '../types/repository';
import { useAnalysisById } from '../hooks/useAnalysisById';
import { useGraphData } from '../hooks/useGraphData';
import { useFileInspector } from '../hooks/useFileInspector';
import { DependencyGraph } from '../components/graph/DependencyGraph';
import { GraphSidePanel } from '../components/graph/GraphSidePanel';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { CopyLinkButton } from '../components/ui/CopyLinkButton';

interface GraphLocationState {
  analysis?: RepositoryAnalysis;
}

/**
 * GraphPage — the interactive dependency graph route.
 *
 * Canonical URL: `/graph/:id`. On load we prefer `location.state.analysis`
 * (handed over from LandingPage / ResultPage) when the ids match; otherwise
 * we fetch the analysis from GET /api/repository/:id so a hard refresh or a
 * shared link still works.
 */
export const GraphPage = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as GraphLocationState | null;
  const { status, analysis, error, reload } = useAnalysisById(id, state?.analysis);

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="flex h-[calc(100vh-72px)] items-center justify-center gap-3 text-sm text-white/60">
        <Spinner size={16} /> Loading analysis…
      </div>
    );
  }

  if (status === 'error' || !analysis) {
    return (
      <div className="flex h-[calc(100vh-72px)] items-center justify-center px-6">
        <div
          className="glass max-w-md rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-6 shadow-glass"
          role="alert"
        >
          <div className="text-sm font-medium text-red-200">Analysis unavailable</div>
          <p className="mt-1 text-sm text-red-100/70">
            {error?.message ?? 'This analysis was not found or has expired.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="md" variant="ghost" onClick={reload}>
              Try again
            </Button>
            <Button size="md" variant="primary" onClick={() => navigate('/')}>
              Analyze a repository
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <GraphPageContent analysis={analysis} />;
};

const GraphPageContent = ({ analysis }: { analysis: RepositoryAnalysis }) => {
  const navigate = useNavigate();
  const graphState = useGraphData(analysis.id);
  const inspector = useFileInspector(analysis.id);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (inspector.selectedPath) setPanelOpen(true);
  }, [inspector.selectedPath]);

  const handleSelect = (path: string | null) => {
    inspector.select(path);
    if (path === null) setPanelOpen(false);
  };

  return (
    <div className="flex h-[calc(100vh-72px)] w-full flex-col">
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-6 py-3"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40">
            <span>Dependency graph</span>
            <Badge tone="accent">{analysis.dependencySummary.totalNodes} nodes</Badge>
            <Badge tone="neutral">{analysis.dependencySummary.totalEdges} edges</Badge>
            {analysis.dependencySummary.circularDependencies > 0 ? (
              <Badge tone="warning">
                {analysis.dependencySummary.circularDependencies} cycle
                {analysis.dependencySummary.circularDependencies === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-white">
            <span className="text-white/50">{analysis.owner}</span>
            <span className="text-white/35"> / </span>
            <span>{analysis.name}</span>
          </h1>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <CopyLinkButton path={`/graph/${analysis.id}`} />
          <Button
            variant="ghost"
            size="md"
            onClick={() => navigate(`/result/${analysis.id}`, { state: { analysis } })}
          >
            Overview
          </Button>
          <Button variant="primary" size="md" onClick={() => navigate('/')}>
            Map another
          </Button>
        </div>
      </motion.div>

      <div className="relative min-h-0 flex-1 border-t border-white/[0.05]">
        {graphState.status === 'loading' ? (
          <div className="flex h-full items-center justify-center gap-3 text-sm text-white/60">
            <Spinner size={16} /> Building dependency graph…
          </div>
        ) : graphState.status === 'error' && graphState.error ? (
          <div className="flex h-full items-center justify-center">
            <div
              className="glass max-w-md rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-6 shadow-glass"
              role="alert"
            >
              <div className="text-sm font-medium text-red-200">Could not load graph</div>
              <p className="mt-1 text-sm text-red-100/70">{graphState.error.message}</p>
              <div className="mt-4">
                <Button size="md" variant="ghost" onClick={graphState.reload}>
                  Try again
                </Button>
              </div>
            </div>
          </div>
        ) : graphState.status === 'success' && graphState.graph && graphState.neighborIndex ? (
          <>
            <DependencyGraph
              graph={graphState.graph}
              neighborIndex={graphState.neighborIndex}
              filesInCycles={graphState.filesInCycles}
              selectedFilePath={inspector.selectedPath}
              onSelectFile={handleSelect}
            />
            <GraphSidePanel
              open={panelOpen && inspector.selectedPath !== null}
              onClose={() => handleSelect(null)}
              onSelectFile={(p) => handleSelect(p)}
              status={inspector.status}
              data={inspector.data}
              error={inspector.error}
            />
          </>
        ) : null}
      </div>
    </div>
  );
};
