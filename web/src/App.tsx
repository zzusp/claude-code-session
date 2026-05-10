import { lazy, Suspense, useCallback, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import SearchModal from './components/SearchModal.tsx';
import Sidebar from './components/Sidebar.tsx';
import { useGlobalHotkey } from './lib/hotkeys.ts';
import ProjectDetail from './routes/ProjectDetail.tsx';
import ProjectsList from './routes/ProjectsList.tsx';
import SessionDetail from './routes/SessionDetail.tsx';

const DiskUsage = lazy(() => import('./routes/DiskUsage.tsx'));
const ProjectMemory = lazy(() => import('./routes/ProjectMemory.tsx'));

export default function App() {
  const [searchOpen, setSearchOpen] = useState(false);
  const toggleSearch = useCallback(() => setSearchOpen((v) => !v), []);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  useGlobalHotkey('mod+k', toggleSearch);

  return (
    <div className="flex min-h-dvh">
      <Sidebar onSearchOpen={openSearch} />
      <main className="flex-1 min-w-0">
        <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-12">
          <Routes>
            <Route path="/" element={<ProjectsList />} />
            <Route path="/projects/:projectId" element={<ProjectDetail />} />
            <Route
              path="/projects/:projectId/memory"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <ProjectMemory />
                </Suspense>
              }
            />
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
      <SearchModal open={searchOpen} onClose={closeSearch} />
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
