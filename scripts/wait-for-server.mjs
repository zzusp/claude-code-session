import net from 'node:net';

const HOST = '127.0.0.1';
const PORT = 3131;
const TIMEOUT_MS = 30_000;
const RETRY_MS = 200;

function tryConnect() {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: HOST, port: PORT });
    sock.once('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.once('error', () => {
      sock.destroy();
      resolve(false);
    });
  });
}

const start = Date.now();
process.stdout.write(`[wait-for-server] polling ${HOST}:${PORT}...\n`);
while (Date.now() - start < TIMEOUT_MS) {
  if (await tryConnect()) {
    process.stdout.write(`[wait-for-server] backend ready in ${Date.now() - start}ms\n`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, RETRY_MS));
}

process.stderr.write(`[wait-for-server] timed out after ${TIMEOUT_MS}ms — is the backend crashing?\n`);
process.exit(1);
