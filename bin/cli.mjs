#!/usr/bin/env node
// ccsm — Claude Code Session Manager CLI launcher.
//
// Plain JS so it runs under a bare `node` (global install / npx) with no build
// step. --help/--version are answered here without loading the server. For the
// real thing we register tsx's ESM loader (resolved from THIS package, so it
// works regardless of the user's cwd) and import the TypeScript server entry —
// the same path `npm run start` (`tsx server/index.ts`) takes.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, '..');
const args = process.argv.slice(2);

if (args.includes('-v') || args.includes('--version')) {
  const { version } = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
  console.log(version);
  process.exit(0);
}

if (args.includes('-h') || args.includes('--help')) {
  printHelp();
  process.exit(0);
}

const { register } = await import('tsx/esm/api');
register();
await import(pathToFileURL(join(pkgRoot, 'server', 'index.ts')).href);

function printHelp() {
  console.log(`ccsm — Claude Code Session Manager

A local web UI to browse and clean up your Claude Code session history (~/.claude/).

Usage:
  ccsm [options]

Options:
  -p, --port <number>   Port to listen on. Default: first free port in 3131-3140.
                        If the given port is busy, ccsm exits (it won't pick another).
      --host <host>     Host to bind. Default: 127.0.0.1 (loopback only).
                        Pass 0.0.0.0 to expose the UI on your LAN. There is NO
                        authentication, so only do this on a network you trust.
  -o, --open            Open the UI in your default browser once it's listening.
  -h, --help            Show this help and exit.
  -v, --version         Print the version and exit.

The server binds to 127.0.0.1 by default and is unreachable from the network.
Once it's up, open http://127.0.0.1:<port> in your browser.`);
}
