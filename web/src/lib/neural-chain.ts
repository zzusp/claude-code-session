import type { Message } from './api.ts';

// ── 思维/执行链抽取 ──────────────────────────────────────────────────────────
//
// 把一条会话(Message[])展平成块级的执行链节点序列:每个 thinking / tool_use /
// tool_result / text 块都是一个「神经元」。节点顺序 = 真实时间序(消息序 + 消息内
// 块序),相邻节点构成一条边。image / unknown / 系统(isMeta)块不进链。
//
// 纯函数、无 i18n / DOM 依赖,便于推理与复用;展示标签由组件用 t() 组合。

export type ChainNodeKind = 'user' | 'thinking' | 'text' | 'tool_use' | 'tool_result';

export interface ChainNode {
  /** 全局序号(也是链中的位置)。 */
  idx: number;
  kind: ChainNodeKind;
  /** 该块所属消息的角色;tool_result 记录在 user 消息里,故 role 可能为 user。 */
  role: 'user' | 'assistant';
  /** 所属消息 uuid——点击节点跳回时间线对应消息用。 */
  messageUuid: string;
  /** 仅 tool_result:对应 tool_result.isError。 */
  isError: boolean;
  /** tool_use 的工具名;其余为 null。 */
  name: string | null;
  /** tool_use 的 id / tool_result 的 toolUseId——供组件跨块反查工具名。 */
  refId: string | null;
  /** 短预览:截断后的 text / thinking / user 文本,或工具名。 */
  preview: string;
}

const PREVIEW_MAX = 72;

function preview(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > PREVIEW_MAX ? oneLine.slice(0, PREVIEW_MAX) + '…' : oneLine;
}

export function buildChain(messages: Message[]): ChainNode[] {
  const nodes: ChainNode[] = [];
  let idx = 0;
  for (const m of messages) {
    if (m.isMeta) continue;
    for (const b of m.blocks) {
      let node: ChainNode | null = null;
      switch (b.type) {
        case 'text':
          node = {
            idx,
            kind: m.type === 'user' ? 'user' : 'text',
            role: m.type,
            messageUuid: m.uuid,
            isError: false,
            name: null,
            refId: null,
            preview: preview(b.text),
          };
          break;
        case 'thinking':
          node = {
            idx,
            kind: 'thinking',
            role: m.type,
            messageUuid: m.uuid,
            isError: false,
            name: null,
            refId: null,
            preview: preview(b.text),
          };
          break;
        case 'tool_use':
          node = {
            idx,
            kind: 'tool_use',
            role: m.type,
            messageUuid: m.uuid,
            isError: false,
            name: b.name,
            refId: b.id,
            preview: b.name,
          };
          break;
        case 'tool_result':
          node = {
            idx,
            kind: 'tool_result',
            role: m.type,
            messageUuid: m.uuid,
            isError: b.isError,
            name: null,
            refId: b.toolUseId,
            preview: preview(b.content),
          };
          break;
        // image / unknown: 不进链
      }
      if (node) {
        nodes.push(node);
        idx += 1;
      }
    }
  }
  return nodes;
}
