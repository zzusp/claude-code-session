import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Loading } from './components/Loading.tsx';
import SearchModal from './components/SearchModal.tsx';
import Sidebar from './components/Sidebar.tsx';
import { useGlobalHotkey } from './lib/hotkeys.ts';
import { useT } from './lib/i18n.ts';
import { SidebarContext, useCollapsedState } from './lib/sidebar.ts';
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

  // 侧栏折叠状态提升到这一层。两个来源：用户显式偏好（持久化）+ 路由临时自动收起
  // （不持久化，关闭/离开即恢复）。实际折叠 = 两者取或；展开侧栏时一并清掉自动收起。
  const [userCollapsed, setUserCollapsed] = useCollapsedState();
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  const collapsed = userCollapsed || autoCollapsed;
  const setCollapsed = useCallback(
    (v: boolean) => {
      setUserCollapsed(v);
      if (!v) setAutoCollapsed(false); // 用户主动展开 → 退出会话页临时收起态，别再被强收
    },
    [setUserCollapsed],
  );
  const sidebarCtx = useMemo(() => ({ setAutoCollapsed }), [setAutoCollapsed]);

  // 会话详情页是定高三层（页头/页脚固定、中间区内部滚动），需要一个铺满视口高度、
  // 去掉纵向留白的外壳；其它路由维持原「窗口滚动 + 带 py 的居中容器」。用路径判断，
  // 避免给每个路由各包一层壳。
  const { pathname } = useLocation();
  const fullBleed = /\/sessions\/[^/]+$/.test(pathname);

  return (
    <SidebarContext.Provider value={sidebarCtx}>
      <div className={'flex ' + (fullBleed ? 'h-dvh overflow-hidden' : 'min-h-dvh')}>
        <Sidebar onSearchOpen={openSearch} collapsed={collapsed} setCollapsed={setCollapsed} />
        <main className={'min-w-0 flex-1' + (fullBleed ? ' flex min-h-0 flex-col' : '')}>
          <div
            className={
              // 会话页（fullBleed）铺满整个主区宽度、不套 max-w 盒、不加外层左右留白——
              // 三层各自在内部设置 padding。其它路由维持居中 + 带留白的窗口滚动布局。
              fullBleed
                ? 'flex min-h-0 w-full flex-1 flex-col'
                : 'mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-12'
            }
          >
            <Outlet />
          </div>
        </main>
        <SearchModal open={searchOpen} onClose={closeSearch} />
      </div>
    </SidebarContext.Provider>
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
