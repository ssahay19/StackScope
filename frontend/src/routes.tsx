import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { LandingPage } from './pages/LandingPage';
import { ResultPage } from './pages/ResultPage';
import { Spinner } from './components/ui/Spinner';

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
    path: '/result',
    element: (
      <AppShell>
        <ResultPage />
      </AppShell>
    ),
  },
  {
    path: '/graph',
    element: (
      <AppShell>
        <Suspense fallback={<RouteFallback />}>
          <GraphPage />
        </Suspense>
      </AppShell>
    ),
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
