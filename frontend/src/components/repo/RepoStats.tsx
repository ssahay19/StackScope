import { GlassCard } from '../ui/GlassCard';
import type { RepositoryAnalysis } from '../../types/repository';

interface RepoStatsProps {
  analysis: RepositoryAnalysis;
}

const formatDate = (iso: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
};

interface StatProps {
  label: string;
  value: string | number;
  hint?: string;
}

const Stat = ({ label, value, hint }: StatProps) => (
  <div>
    <div className="text-xs uppercase tracking-wider text-white/40">{label}</div>
    <div className="mt-1.5 text-2xl font-semibold text-white/95 tabular-nums">{value}</div>
    {hint ? <div className="mt-0.5 text-xs text-white/40">{hint}</div> : null}
  </div>
);

export const RepoStats = ({ analysis }: RepoStatsProps) => {
  const dep = analysis.dependencySummary;
  return (
    <GlassCard>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Primary Language" value={analysis.language} />
        <Stat label="Files" value={analysis.totalFiles.toLocaleString()} />
        <Stat label="Folders" value={analysis.totalFolders.toLocaleString()} />
        <Stat label="Analyzed" value={formatDate(analysis.analyzedAt)} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6 border-t border-white/[0.06] pt-6 sm:grid-cols-4">
        <Stat
          label="Files Parsed"
          value={dep.filesParsed.toLocaleString()}
          hint={`${dep.filesSkipped.toLocaleString()} skipped · ${dep.filesFailed.toLocaleString()} failed`}
        />
        <Stat label="Dependency Nodes" value={dep.totalNodes.toLocaleString()} />
        <Stat label="Dependency Edges" value={dep.totalEdges.toLocaleString()} />
        <Stat
          label="Cycles"
          value={dep.circularDependencies.toLocaleString()}
          hint={dep.circularDependencies === 0 ? 'no import cycles' : 'circular imports detected'}
        />
      </div>
    </GlassCard>
  );
};
