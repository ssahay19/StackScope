import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { HeroSection } from '../components/analyze/HeroSection';
import { UrlInput } from '../components/analyze/UrlInput';
import { Button } from '../components/ui/Button';
import { GlassCard } from '../components/ui/GlassCard';
import { describeInvalidUrl, isValidGithubUrl } from '../lib/validators';
import { useAnalyzeRepo } from '../hooks/useAnalyzeRepo';

const LOADING_STAGES = [
  'Cloning repository',
  'Scanning files',
  'Building repository map',
];

const EXAMPLES: Array<{ label: string; url: string }> = [
  { label: 'octocat/Hello-World', url: 'https://github.com/octocat/Hello-World' },
  { label: 'facebook/react', url: 'https://github.com/facebook/react' },
  { label: 'vercel/next.js', url: 'https://github.com/vercel/next.js' },
];

const FEATURES: Array<{ title: string; description: string }> = [
  {
    title: 'Instant repository map',
    description: 'Total files, folders, primary language and a language breakdown at a glance.',
  },
  {
    title: 'Explorable file tree',
    description: 'Expandable, keyboard-friendly folder tree so you can see how the code is laid out.',
  },
  {
    title: 'No setup, no code executed',
    description: 'Only public repositories are cloned into a sandboxed temp directory, then deleted.',
  },
];

export const LandingPage = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState('');
  const [stageIndex, setStageIndex] = useState(0);

  const { status, error, analyze } = useAnalyzeRepo();

  const isLoading = status === 'loading';
  const invalidMessage = useMemo(() => describeInvalidUrl(url), [url]);
  const isValid = isValidGithubUrl(url);
  const canSubmit = isValid && !isLoading;

  useEffect(() => {
    if (!isLoading) {
      setStageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setStageIndex((i) => (i + 1) % LOADING_STAGES.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const result = await analyze(url.trim());
    if (result) {
      // Graph is the centerpiece; land there by default.
      navigate('/graph', { state: { analysis: result } });
    }
  };

  return (
    <>
      <HeroSection>
        <GlassCard className="mx-auto max-w-xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
            <label htmlFor="repo-url" className="sr-only">
              GitHub repository URL
            </label>
            <UrlInput
              id="repo-url"
              ref={inputRef}
              value={url}
              onChange={setUrl}
              invalidMessage={invalidMessage}
              disabled={isLoading}
            />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-white/40">
                Public GitHub URLs only ·{' '}
                <span className="text-white/50">https://github.com/&lt;owner&gt;/&lt;repo&gt;</span>
              </p>
              <Button
                type="submit"
                size="lg"
                variant="primary"
                isLoading={isLoading}
                disabled={!canSubmit}
              >
                {isLoading ? LOADING_STAGES[stageIndex] : 'Map Repository'}
              </Button>
            </div>
          </form>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-white/40">Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.url}
                type="button"
                onClick={() => setUrl(ex.url)}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-white/70 hover:border-white/20 hover:text-white transition-colors"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </GlassCard>

        <AnimatePresence mode="wait">
          {error ? (
            <motion.div
              key={error.code}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="mx-auto mt-6 max-w-xl"
              role="alert"
            >
              <GlassCard
                className="border-red-500/30 bg-red-500/[0.05]"
                padded={false}
              >
                <div className="p-5">
                  <p className="text-sm font-medium text-red-200">{error.title}</p>
                  <p className="mt-1 text-sm text-red-100/70">{error.message}</p>
                </div>
              </GlassCard>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </HeroSection>

      <section className="mx-auto mt-24 w-full max-w-5xl px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <GlassCard key={feature.title} className="h-full">
              <div className="text-sm font-semibold text-white/90">{feature.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{feature.description}</p>
            </GlassCard>
          ))}
        </div>
      </section>
    </>
  );
};
