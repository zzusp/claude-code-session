import { spawn } from 'node:child_process';
import fs from 'node:fs';

export interface OpenResult {
  ok: boolean;
  error?: string;
}

export function openFolder(folderPath: string): OpenResult {
  try {
    const st = fs.statSync(folderPath);
    if (!st.isDirectory()) return { ok: false, error: 'not a directory' };
  } catch {
    return { ok: false, error: 'path not found' };
  }
  return launch(folderPath);
}

export function openFile(filePath: string): OpenResult {
  try {
    const st = fs.statSync(filePath);
    if (!st.isFile()) return { ok: false, error: 'not a file' };
  } catch {
    return { ok: false, error: 'path not found' };
  }
  return launch(filePath);
}

// 交给系统默认程序打开（文件 → 关联应用；文件夹 → 资源管理器），等价于双击。
// detached + unref，不阻塞、不等子进程；spawn 失败在异步回调里只记日志。
function launch(target: string): OpenResult {
  let cmd: string;
  if (process.platform === 'win32') cmd = 'explorer.exe';
  else if (process.platform === 'darwin') cmd = 'open';
  else cmd = 'xdg-open';

  try {
    const child = spawn(cmd, [target], { detached: true, stdio: 'ignore' });
    child.on('error', (err) => {
      console.error(`[open] spawn ${cmd} failed:`, err);
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
