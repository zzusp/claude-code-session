import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar.tsx';
import ProjectDetail from './routes/ProjectDetail.tsx';
import ProjectMemory from './routes/ProjectMemory.tsx';
import ProjectsList from './routes/ProjectsList.tsx';
import SessionDetail from './routes/SessionDetail.tsx';

const DiskUsage = lazy(() => import('./routes/DiskUsage.tsx'));

export default function App() {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-12">
          <Routes>
            <Route path="/" element={<ProjectsList />} />
            <Route path="/projects/:projectId" element={<ProjectDetail />} />
            <Route path="/projects/:projectId/memory" element={<ProjectMemory />} />
            <Route
              path="/projects/:projectId/sessions/:sessionId"
              element={<SessionDetail />}
            />
            <Route
              path="/disk"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <DiskUsage />
                </Suspense>
              }
            />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="flex h-40 items-center justify-center text-xs uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
      loading
    </div>
  );
}
