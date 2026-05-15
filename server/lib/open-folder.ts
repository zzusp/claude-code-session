import { spawn } from 'node:child_process';
import fs from 'node:fs';

export interface OpenFolderResult {
  ok: boolean;
  error?: string;
}

export function openFolder(folderPath: string): OpenFolderResult {
  try {
    const st = fs.statSync(folderPath);
    if (!st.isDirectory()) return { ok: false, error: 'not a directory' };
  } catch {
    return { ok: false, error: 'path not found' };
  }

  let cmd: string;
  let args: string[];
  if (process.platform === 'win32') {
    cmd = 'explorer.exe';
    args = [folderPath];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [folderPath];
  } else {
    cmd = 'xdg-open';
    args = [folderPath];
  }

  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', (err) => {
      console.error(`[open-folder] spawn ${cmd} failed:`, err);
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
