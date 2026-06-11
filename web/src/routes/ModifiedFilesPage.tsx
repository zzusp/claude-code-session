import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ModifiedFilesView, { type EditLookup } from '../components/ModifiedFilesView.tsx';
import {
  api,
  type ModifiedFilesResponse,
  type OpenFileResult,
  type SessionDetail,
} from '../lib/api.ts';
import { useT } from '../lib/i18n.ts';
import { queryKeys } from '../lib/query-keys.ts';

/**
 * 「修改的文件」的独立整页视图（由会话页按钮 window.open 到新标签里打开）。
 * 复用 ModifiedFilesView 的三栏渲染——独立整页占满标签，没有 backdrop / 右滑动画，
 * 也不再叠在仍在跑实时轮询的 SessionDetail 之上（叠在其上正是滚动卡顿的根因）。
 * 数据用与会话页相同的 query key 重新拉取（editLookup / 对话栏由 session 详情派生）。
 */
export default function ModifiedFilesPage() {
  const t = useT();
  const navigate = useNavigate();
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>();
  const pid = projectId ?? '';
  const sid = sessionId ?? '';

  const sessionQuery = useQuery({
    queryKey: queryKeys.session(pid, sid),
    queryFn: () =>
      api<SessionDetail>(`/api/sessions/${encodeURIComponent(pid)}/${encodeURIComponent(sid)}`),
    enabled: !!pid && !!sid,
  });

  const modifiedFilesQuery = useQuery({
    queryKey: queryKeys.sessionModifiedFiles(pid, sid),
    queryFn: () =>
      api<ModifiedFilesResponse>(
        `/api/sessions/${encodeURIComponent(pid)}/${encodeURIComponent(sid)}/modified-files`,
      ),
    enabled: !!pid && !!sid,
  });

  const openFileMutation = useMutation({
    mutationFn: (filePath: string) =>
      api<OpenFileResult>(
        `/api/sessions/${encodeURIComponent(pid)}/${encodeURIComponent(sid)}/open-file`,
        { method: 'POST', body: JSON.stringify({ filePath }) },
      ),
    onError: (err: Error) => {
      window.alert(t('session.modified.openFailed', { msg: err.message }));
    },
  });

  const data = sessionQuery.data;

  // tool_use id → { name, input }，供右栏渲染每次编辑的真实内容（与会话页一致）。
  const editLookup: EditLookup = useMemo(() => {
    const map: EditLookup = new Map();
    if (!data) return map;
    for (const m of data.messages) {
      for (const b of m.blocks) {
        if (b.type === 'tool_use' && b.id) map.set(b.id, { name: b.name, input: b.input });
      }
    }
    return map;
  }, [data]);

  // 对话栏：隐去 meta/system 噪声行（与会话页一致）。
  const conversationMessages = useMemo(
    () => data?.messages.filter((m) => !m.isMeta) ?? [],
    [data],
  );

  return (
    <ModifiedFilesView
      files={modifiedFilesQuery.data?.files ?? []}
      cwd={modifiedFilesQuery.data?.cwd ?? data?.meta.cwd ?? null}
      editLookup={editLookup}
      messages={conversationMessages}
      query=""
      isWorking={false}
      loading={modifiedFilesQuery.isLoading || sessionQuery.isLoading}
      error={(modifiedFilesQuery.error ?? sessionQuery.error) as Error | null}
      onOpenFile={(filePath) => openFileMutation.mutate(filePath)}
      onClose={() =>
        navigate(`/projects/${encodeURIComponent(pid)}/sessions/${encodeURIComponent(sid)}`)
      }
    />
  );
}
