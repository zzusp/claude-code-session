import { lazy, Suspense, useCallback, useState } from 'react';
import { Outlet, Route, Routes } from 'react-router-dom';
import { Loading } from './components/Loading.tsx';
import SearchModal from './components/SearchModal.tsx';
import Sidebar from './components/Sidebar.tsx';
import { useGlobalHotkey } from './lib/hotkeys.ts';
import { useT } from './lib/i18n.ts';
import ProjectDetail from './routes/ProjectDetail.tsx';
import ProjectsList from './routes/ProjectsList.tsx';
import SessionDetail from './routes/SessionDetail.tsx';

const DiskUsage = lazy(() => import('./routes/DiskUsage.tsx'));
const ProjectMemory = lazy(() => import('./routes/ProjectMemory.tsx'));
const ImportPage = lazy(() => import('./routes/ImportPage.tsx'));
const ModifiedFilesPage = lazy(() => import('./routes/ModifiedFilesPage.tsx'));

export default function App() {
  return (
    <Routes>
      {/* 独立整页：在新标签里打开，刻意不套 app chrome（无侧栏 / 无 max-w 盒），
          这样三栏占满整个标签页，也脱离会话页的实时轮询与大时间线渲染。 */}
      <Route
        path="/projects/:projectId/sessions/:sessionId/modified"
        element={
          <Suspense fallback={<RouteFallback />}>
            <ModifiedFilesPage />
          </Suspense>
        }
      />
      {/* 其余路由都套在侧栏 + 主区的 chrome 布局里。 */}
      <Route element={<ChromeLayout />}>
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
        <Route
          path="/import"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ImportPage />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}

function ChromeLayout() {
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
          <Outlet />
        </div>
      </main>
      <SearchModal open={searchOpen} onClose={closeSearch} />
    </div>
  );
}

function RouteFallback() {
  const t = useT();
  return (
    <div className="flex h-40 items-center justify-center">
      <Loading label={t('common.loading')} className="items-center" />
    </div>
  );
}
