import { createServer } from 'node:net';

export async function findAvailablePort(
  start: number,
  end: number,
  host = '127.0.0.1',
): Promise<number> {
  for (let port = start; port <= end; port++) {
    if (await isPortFree(port, host)) return port;
  }
  throw new Error(`No free port in range ${start}..${end} on ${host}`);
}

function isPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}
