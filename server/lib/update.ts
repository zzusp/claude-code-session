import { spawn } from 'node:child_process';
import type { VersionUpdateResult } from '../../shared/types.ts';
import { getCurrentVersion, PACKAGE_NAME } from './version.ts';

const MAX_OUTPUT = 64_000;

/**
 * Run `npm install -g <PACKAGE_NAME>@latest` to self-update the global CLI.
 *
 * Fixed args, no user input → safe. Windows needs `shell:true` to invoke `npm.cmd`
 * (Node refuses to spawn `.cmd` without a shell since CVE-2024-27980). A non-zero
 * exit still resolves (ok:false) so the caller can surface npm's output instead of
 * swallowing it. The running process keeps serving the OLD code until restarted.
 */
export function runSelfUpdate(targetVersion: string | null): Promise<VersionUpdateResult> {
  const fromVersion = getCurrentVersion();
  const isWin = process.platform === 'win32';

  return new Promise((resolve) => {
    let output = '';
    const append = (buf: Buffer) => {
      output += buf.toString();
      if (output.length > MAX_OUTPUT) output = output.slice(-MAX_OUTPUT);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn('npm', ['install', '-g', `${PACKAGE_NAME}@latest`], {
        shell: isWin,
        windowsHide: true,
      });
    } catch (err) {
      resolve({
        ok: false,
        fromVersion,
        toVersion: null,
        output: (err as Error).message,
        restartRequired: false,
      });
      return;
    }

    child.stdout?.on('data', append);
    child.stderr?.on('data', append);

    child.on('error', (err) => {
      resolve({
        ok: false,
        fromVersion,
        toVersion: null,
        output: `${output}\n${err.message}`.trim(),
        restartRequired: false,
      });
    });

    child.on('close', (code) => {
      const ok = code === 0;
      resolve({
        ok,
        fromVersion,
        toVersion: ok ? targetVersion : null,
        output: output.trim() || (ok ? 'updated' : `npm exited with code ${code}`),
        restartRequired: ok,
      });
    });
  });
}
