import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import ProjectDetail from './routes/ProjectDetail.tsx';
import ProjectsList from './routes/ProjectsList.tsx';
import SessionDetail from './routes/SessionDetail.tsx';

const DiskUsage = lazy(() => import('./routes/DiskUsage.tsx'));

export default function App() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-neutral-200 bg-white">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/" className="text-base font-semibold tracking-tight text-neutral-900">
            Claude Sessions
          </Link>
          <Link to="/" className="text-sm text-neutral-600 hover:text-neutral-900">
            Projects
          </Link>
          <Link to="/disk" className="text-sm text-neutral-600 hover:text-neutral-900">
            Disk usage
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<ProjectsList />} />
          <Route path="/projects/:projectId" element={<ProjectDetail />} />
          <Route
            path="/projects/:projectId/sessions/:sessionId"
            element={<SessionDetail />}
          />
          <Route
            path="/disk"
            element={
              <Suspense fallback={<p className="text-sm text-neutral-500">Loading…</p>}>
                <DiskUsage />
              </Suspense>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
