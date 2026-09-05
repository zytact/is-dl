import { createServer } from 'node:net';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import type { AppPaths } from './paths.ts';
import { startServer } from './server.ts';

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

async function paths(): Promise<AppPaths> {
  const data = await mkdtemp(join(tmpdir(), 'is-dl-server-'));
  return { runsDir: join(data, 'runs'), runsIndex: join(data, 'runs', 'index.json') } as AppPaths;
}

/**
 * The listening socket and any open SSE stream each keep Node's event loop
 * alive, so a server that never closes turns SIGTERM into a hang.
 */
test('closing releases the port with a log stream still open', async () => {
  const port = await freePort();
  const server = await startServer({
    port,
    host: '127.0.0.1',
    paths: await paths(),
    onLog: () => {},
  });

  const logs = await fetch(`${server.address}/api/logs`);
  expect(logs.ok).toBe(true);

  // A client that goes away without closing its socket is the case that used to
  // make `close` wait forever.
  const abandoned = new AbortController();
  void fetch(`${server.address}/api/logs`, { signal: abandoned.signal }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 100));
  abandoned.abort();

  await server.close();

  await expect(fetch(`${server.address}/api/results`)).rejects.toThrow();

  // Binding the same port again is the proof the socket is gone.
  const second = await startServer({
    port,
    host: '127.0.0.1',
    paths: await paths(),
    onLog: () => {},
  });
  await second.close();
});
