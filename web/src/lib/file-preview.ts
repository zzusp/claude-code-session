import { createContext, useContext } from 'react';

/** 一次文件操作（tool_use）在右侧预览面板里要展示的最小载荷。会话页从已加载的
 *  全量消息里解析这些字段并经 context 下发，文件卡点击即用，不再二次请求。 */
export interface FilePreviewTarget {
  /** 发起该操作的 tool_use id；面板用它反查 Read 的 tool_result 正文。 */
  toolUseId: string;
  /** 工具名：Read / Write / Edit / MultiEdit / NotebookEdit。 */
  name: string;
  /** tool_use 的原始 input（含 file_path / content / old_string…）。 */
  input: unknown;
  /** 已解析出的文件绝对路径，用于标题与高亮。 */
  path: string;
}

export interface FilePreviewContextValue {
  /** 仅在「有预览宿主且当前视口够宽」时为 true；否则文件卡退回原行内展开。 */
  enabled: boolean;
  /** 当前在右栏展示的 tool_use id，用于给对应文件卡加选中态。 */
  activeId: string | null;
  /** 打开（或再次点同一张卡时收起）右侧预览。 */
  open: (target: FilePreviewTarget) => void;
}

/** 默认 null：没有宿主（如修改文件视图、搜索弹窗里复用 MessageBubble 时）即视为
 *  无预览能力，文件卡保持原行内展开行为。 */
export const FilePreviewContext = createContext<FilePreviewContextValue | null>(null);

export function useFilePreview(): FilePreviewContextValue | null {
  return useContext(FilePreviewContext);
}
