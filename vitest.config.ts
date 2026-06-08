import { defineConfig } from 'vitest/config';

// 仅覆盖 server 端 safety-net 核心逻辑（路径校验、删除级联、bundle 双向替换）。
// web/ 走 vite + 浏览器手工 e2e，不在此 runner 范围。
export default defineConfig({
  test: {
    include: ['server/**/*.test.ts'],
    environment: 'node',
    // mock 注入 PATHS（vi.mock claude-paths）依赖每个测试文件独立模块图，
    // 关闭文件级并行避免一个 suite 的 fake root 漏到隔壁。
    fileParallelism: false,
  },
});
