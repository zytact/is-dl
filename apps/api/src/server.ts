import { createReadStream } from 'node:fs';

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import archiver from 'archiver';
import type { AppPaths } from './paths.ts';
import { ensureDir } from './fs.ts';
import { listRuns, newRunId, readRun, removeRun, runIdFromFilename, saveRun } from './runs.ts';
import { type ScrapeRequest, runScraper } from './scraper.ts';
import { isJobSource, isUnstopOpportunity, JOB_SOURCES, type JobSource } from './types.ts';

/** Accepts either a JSON array or a comma-joined string. */
function csv(value: unknown): string[] | undefined {
  const parts = Array.isArray(value)
    ? value.filter((item) => typeof item === 'string')
    : typeof value === 'string'
      ? value.split(',')
      : undefined;
  const items = parts?.map((item) => item.trim()).filter(Boolean);
  return items?.length ? items : undefined;
}

/** Unknown names in a request body are ignored; an empty result means both. */
function readSources(value: unknown): JobSource[] {
  const names = csv(value)?.filter(isJobSource) ?? [];
  return names.length ? [...new Set(names)] : [...JOB_SOURCES];
}

/** One open `/api/logs` stream. `end` is what lets shutdown release the socket. */
interface SseClient {
  send: (data: string) => void;
  end: () => void;
}

let currentLogs: string[] = [];
let isScraping = false;
let scrapeAbortController: AbortController | null = null;
const sseClients = new Set<SseClient>();

function broadcast(payload: unknown): void {
  const sseMsg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.send(sseMsg);
    } catch {
      // ignore broken pipes
    }
  }
}

const addLog = (msg: string) => {
  currentLogs.push(msg);
  broadcast({ type: 'log', message: msg });
};

const notifyStatus = (status: boolean) => {
  isScraping = status;
  broadcast({ type: 'status', isScraping });
};

async function handleRequest(req: Request, paths: AppPaths) {
  const outputDir = paths.runsDir;
  const url = new URL(req.url);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (url.pathname === '/api/logs' && req.method === 'GET') {
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        const client: SseClient = {
          send: (data) => {
            if (!closed) controller.enqueue(new TextEncoder().encode(data));
          },
          end: () => {
            if (closed) return;
            closed = true;
            sseClients.delete(client);
            controller.close();
          },
        };

        sseClients.add(client);

        client.send(`data: ${JSON.stringify({ type: 'status', isScraping })}\n\n`);
        for (const log of currentLogs) {
          client.send(`data: ${JSON.stringify({ type: 'log', message: log })}\n\n`);
        }

        req.signal.addEventListener('abort', () => client.end());
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  if (url.pathname === '/api/scrape' && req.method === 'POST') {
    if (isScraping) {
      return new Response(JSON.stringify({ error: 'Scraping already in progress' }), {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    try {
      const body = (await req.json()) as Record<string, unknown>;
      const opportunity =
        typeof body.unstopOpportunity === 'string' && isUnstopOpportunity(body.unstopOpportunity)
          ? body.unstopOpportunity
          : 'jobs';

      const request: ScrapeRequest = {
        query: {
          keywords: typeof body.keywords === 'string' ? body.keywords : '',
          location: typeof body.location === 'string' ? body.location : '',
          limit: typeof body.limit === 'number' ? body.limit : Number(body.limit) || 50,
          remoteOnly: typeof body.remoteOnly === 'boolean' ? body.remoteOnly : false,
        },
        sources: readSources(body.sources),
        linkedin: {
          sessionFile: paths.sessionFile,
          debugDir: paths.cache,
          timeout: 30000,
          headless: typeof body.headless === 'boolean' ? body.headless : true,
          debug: typeof body.debug === 'boolean' ? body.debug : false,
          experienceLevel: csv(body.experienceLevel),
          jobType: csv(body.jobType),
          postedWithin:
            typeof body.postedWithin === 'string' ? body.postedWithin || undefined : undefined,
        },
        unstop: { opportunity, roles: csv(body.unstopRoles) },
      };

      if (!request.query.keywords) {
        return new Response(JSON.stringify({ error: 'Keywords are required' }), {
          status: 400,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }

      currentLogs = [];
      notifyStatus(true);

      scrapeAbortController = new AbortController();
      const signal = scrapeAbortController.signal;

      runScraper(request, addLog, signal)
        .then(async (output) => {
          const outPath = await saveRun(paths, newRunId(), output);
          addLog(`\n--- SCRAPE FINISHED: ${outPath} ---`);
          notifyStatus(false);
          scrapeAbortController = null;
        })
        .catch(() => {
          const msg = signal.aborted ? '\n--- SCRAPE ABORTED ---' : '\n--- SCRAPE FAILED ---';
          addLog(msg);
          notifyStatus(false);
          scrapeAbortController = null;
        });

      return new Response(JSON.stringify({ success: true, message: 'Scraper started' }), {
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  if (url.pathname === '/api/abort' && req.method === 'POST') {
    if (!scrapeAbortController || !isScraping) {
      return new Response(JSON.stringify({ error: 'No active scrape to abort' }), {
        status: 409,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    addLog('[SYSTEM] Abort requested.');
    scrapeAbortController.abort();
    return new Response(JSON.stringify({ success: true, message: 'Abort signaled' }), {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  if (url.pathname === '/api/results' && req.method === 'GET') {
    try {
      await ensureDir(outputDir);

      // From the run index, so history loading does not mean parsing every
      // saved listing. A file that will not parse never reaches the index.
      const results = (await listRuns(paths)).map((run) => ({
        filename: `${run.runId}.json`,
        meta: run.meta,
        count: run.count,
        aiAgentSummary: run.meta.aiAgentSummary,
      }));

      return new Response(JSON.stringify({ results }), {
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    } catch {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  if (url.pathname === '/api/results/export' && req.method === 'GET') {
    try {
      await ensureDir(outputDir);
      const jsonFiles = (await listRuns(paths)).map((run) => `${run.runId}.json`);

      if (jsonFiles.length === 0) {
        return new Response('No results to export', {
          status: 404,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }

      const archive = archiver('zip', { zlib: { level: 9 } });
      const passThrough = new PassThrough();

      archive.on('error', () => {
        // The stream ends; the client sees a truncated archive.
      });

      archive.pipe(passThrough);

      for (const file of jsonFiles) {
        const filePath = join(outputDir, file);
        archive.append(createReadStream(filePath), { name: file });
      }

      void archive.finalize();

      return new Response(Readable.toWeb(passThrough), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="results-export.zip"',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      return new Response(message, {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  if (url.pathname.startsWith('/api/results/') && req.method === 'DELETE') {
    const rawName = url.pathname.split('/').pop();
    const decodedName = rawName ? decodeURIComponent(rawName) : null;
    const filename = decodedName ? decodedName.split('/').pop() : null;
    if (!filename || !filename.endsWith('.json')) {
      return new Response('Invalid filename', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    try {
      await removeRun(paths, runIdFromFilename(filename));
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete';
      const status = message.includes('Run not found') ? 404 : 500;
      return new Response(message, {
        status,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  if (url.pathname.startsWith('/api/results/') && req.method === 'GET') {
    const filename = url.pathname.split('/').pop();
    if (!filename || !filename.endsWith('.json')) {
      return new Response('Not found', {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    try {
      const output = await readRun(paths, runIdFromFilename(filename));
      return new Response(JSON.stringify(output), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch {
      return new Response('Not found', {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  return new Response('Not found', {
    status: 404,
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

export interface ServerOptions {
  port: number;
  host: string;
  paths: AppPaths;
  onLog?: (msg: string) => void;
}

export interface RunningServer {
  address: string;
  /**
   * Stops listening and releases everything holding the event loop open, so the
   * process exits on its own. A listening socket alone keeps Node alive, and an
   * open SSE stream keeps its connection alive on top of that.
   */
  close(): Promise<void>;
}

/** Resolves once the socket is bound. */
export function startServer(options: ServerOptions): Promise<RunningServer> {
  const log = options.onLog ?? ((msg: string) => process.stderr.write(`${msg}\n`));
  const server = createServer((req, res) => {
    void respond(req, res, options.paths, log);
  });

  const close = (): Promise<void> => {
    // A scrape in flight owns a browser, which would outlive the server.
    scrapeAbortController?.abort();
    // Deleting the current entry mid-iteration is safe on a Set.
    for (const client of sseClients) client.end();

    return new Promise((resolve) => {
      server.close(() => resolve());
      // The streams above ended cleanly. Whatever is still attached is a client
      // that went away without closing its socket, and `close` would wait for
      // it forever, which is the hang this exists to prevent.
      server.closeAllConnections();
    });
  };

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      resolve({ address: `http://${options.host}:${options.port}`, close });
    });
  });
}

async function respond(
  req: IncomingMessage,
  res: ServerResponse,
  paths: AppPaths,
  log: (msg: string) => void,
) {
  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  try {
    const request = nodeRequestToFetchRequest(req, abortController.signal);
    const response = await handleRequest(request, paths);
    await writeFetchResponse(res, response);
  } catch (err) {
    if (abortController.signal.aborted) {
      return;
    }

    log(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
    res.writeHead(500, { 'Access-Control-Allow-Origin': '*' });
    res.end('Internal server error');
  }
}

function nodeRequestToFetchRequest(req: IncomingMessage, signal: AbortSignal) {
  const host = req.headers.host ?? 'localhost:3000';
  const url = `http://${host}${req.url ?? '/'}`;
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (typeof value === 'string') {
      headers.set(name, value);
    }
  }

  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers,
    signal,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = Readable.toWeb(req) as ReadableStream;
    init.duplex = 'half';
  }

  return new Request(url, init);
}

async function writeFetchResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>)
      .on('error', reject)
      .on('end', resolve)
      .pipe(res);
  });
}
