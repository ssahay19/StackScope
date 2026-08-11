import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, useLocation, useParams } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { LandingPage } from './pages/LandingPage';
import { ResultPage } from './pages/ResultPage';
import { Spinner } from './components/ui/Spinner';
import type { RepositoryAnalysis } from './types/repository';

/**
 * Route-level code splitting.
 *
 * GraphPage pulls in React Flow + ELK (~500KB gzipped). Splitting it keeps
 * the landing page fast and defers that cost until a user actually clicks
 * "View graph".
 */
const GraphPage = lazy(() =>
  import('./pages/GraphPage').then((m) => ({ default: m.GraphPage })),
);

const RouteFallback = () => (
  <div className="flex h-[50vh] items-center justify-center gap-3 text-sm text-white/60">
    <Spinner size={16} /> Loading…
  </div>
);

interface AnalysisLocationState {
  analysis?: RepositoryAnalysis;
}

/**
 * Legacy `/result` and `/graph` (no id) — redirect to the id'd URL when we
 * still have analysis in location.state; otherwise bounce home.
 */
const LegacyRedirect = ({ to }: { to: 'result' | 'graph' }) => {
  const location = useLocation();
  const state = location.state as AnalysisLocationState | null;
  const id = state?.analysis?.id;
  if (id) {
    return <Navigate to={`/${to}/${id}`} replace state={state} />;
  }
  return <Navigate to="/" replace />;
};

/** Guard empty `:id` params. */
const RequireId = ({ children }: { children: React.ReactNode }) => {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/" replace />;
  return <>{children}</>;
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <AppShell>
        <LandingPage />
      </AppShell>
    ),
  },
  {
    path: '/result/:id',
    element: (
      <AppShell>
        <RequireId>
          <ResultPage />
        </RequireId>
      </AppShell>
    ),
  },
  {
    path: '/graph/:id',
    element: (
      <AppShell>
        <RequireId>
          <Suspense fallback={<RouteFallback />}>
            <GraphPage />
          </Suspense>
        </RequireId>
      </AppShell>
    ),
  },
  // Back-compat for Phase 2/3 bookmarks that omitted the id.
  { path: '/result', element: <LegacyRedirect to="result" /> },
  { path: '/graph', element: <LegacyRedirect to="graph" /> },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
