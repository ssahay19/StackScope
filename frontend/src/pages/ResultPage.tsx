import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { FolderTree } from '../components/repo/FolderTree';
import { LanguageBreakdown } from '../components/repo/LanguageBreakdown';
import { RepoStats } from '../components/repo/RepoStats';
import { FileInspector } from '../components/repo/FileInspector';
import { useFileInspector } from '../hooks/useFileInspector';
import type { RepositoryAnalysis } from '../types/repository';

interface ResultLocationState {
  analysis?: RepositoryAnalysis;
}

export const ResultPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ResultLocationState | null;
  const analysis = state?.analysis;

  useEffect(() => {
    if (!analysis) {
      navigate('/', { replace: true });
    }
  }, [analysis, navigate]);

  if (!analysis) return null;

  return <ResultPageContent analysis={analysis} />;
};

const ResultPageContent = ({ analysis }: { analysis: RepositoryAnalysis }) => {
  const navigate = useNavigate();
  const inspector = useFileInspector(analysis.id);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/40">
            <span>Repository</span>
            <Badge tone="accent">{analysis.language}</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            <span className="text-white/60">{analysis.owner}</span>
            <span className="text-white/40"> / </span>
            <span>{analysis.name}</span>
          </h1>
          <p className="mt-2 text-sm text-white/50">
            {analysis.totalFiles.toLocaleString()} files ·{' '}
            {analysis.totalFolders.toLocaleString()} folders ·{' '}
            {analysis.dependencySummary.filesParsed.toLocaleString()} parsed
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`https://github.com/${analysis.owner}/${analysis.name}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            <Button variant="ghost" size="md">
              Open on GitHub
            </Button>
          </a>
          <Button
            variant="ghost"
            size="md"
            onClick={() => navigate('/graph', { state: { analysis } })}
          >
            View graph
          </Button>
          <Button variant="primary" size="md" onClick={() => navigate('/')}>
            Map another
          </Button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05, ease: 'easeOut' }}
        className="mt-8"
      >
        <RepoStats analysis={analysis} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
        className="mt-6"
      >
        <LanguageBreakdown languages={analysis.languages} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: 'easeOut' }}
        className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]"
      >
        <FolderTree
          tree={analysis.tree}
          selectedPath={inspector.selectedPath}
          onFileSelect={inspector.select}
        />
        <FileInspector
          selectedPath={inspector.selectedPath}
          data={inspector.data}
          status={inspector.status}
          error={inspector.error}
          onSelectFile={inspector.select}
        />
      </motion.div>
    </div>
  );
};
