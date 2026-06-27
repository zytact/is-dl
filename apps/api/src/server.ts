import { createReadStream } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import { runScraper } from './scraper.ts';
import type { SearchOptions } from './types.ts';

let currentLogs: string[] = [];
let isScraping = false;
let scrapeAbortController: AbortController | null = null;
const sseControllers: Set<(data: string) => void> = new Set();
const outputDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');

const addLog = (msg: string) => {
  currentLogs.push(msg);
  const sseMsg = `data: ${JSON.stringify({ type: 'log', message: msg })}\n\n`;
  for (const controller of sseControllers) {
    try {
      controller(sseMsg);
    } catch {
      // ignore broken pipes
    }
  }
};

const notifyStatus = (status: boolean) => {
  isScraping = status;
  const sseMsg = `data: ${JSON.stringify({ type: 'status', isScraping })}\n\n`;
  for (const controller of sseControllers) {
    try {
      controller(sseMsg);
    } catch {
      // ignore broken pipes
    }
  }
};

async function handleRequest(req: Request) {
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
        const send = (data: string) => {
          if (!closed) {
            controller.enqueue(new TextEncoder().encode(data));
          }
        };

        sseControllers.add(send);

        send(`data: ${JSON.stringify({ type: 'status', isScraping })}\n\n`);
        for (const log of currentLogs) {
          send(`data: ${JSON.stringify({ type: 'log', message: log })}\n\n`);
        }

        req.signal.addEventListener('abort', () => {
          closed = true;
          sseControllers.delete(send);
          controller.close();
        });
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
      const options: SearchOptions = {
        keywords: typeof body.keywords === 'string' ? body.keywords : '',
        location: typeof body.location === 'string' ? body.location : '',
        limit: typeof body.limit === 'number' ? body.limit : Number(body.limit) || 50,
        outDir: outputDir,
        headless: typeof body.headless === 'boolean' ? body.headless : true,
        debug: typeof body.debug === 'boolean' ? body.debug : false,
        remoteOnly: typeof body.remoteOnly === 'boolean' ? body.remoteOnly : false,
        experienceLevel:
          typeof body.experienceLevel === 'string' && body.experienceLevel
            ? body.experienceLevel.split(',').map((s) => s.trim())
            : undefined,
        jobType:
          typeof body.jobType === 'string' && body.jobType
            ? body.jobType.split(',').map((s) => s.trim())
            : undefined,
        postedWithin:
          typeof body.postedWithin === 'string' ? body.postedWithin || undefined : undefined,
      };

      if (!options.keywords) {
        return new Response(JSON.stringify({ error: 'Keywords are required' }), {
          status: 400,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }

      currentLogs = [];
      notifyStatus(true);

      scrapeAbortController = new AbortController();
      const signal = scrapeAbortController.signal;

      runScraper(
        options,
        (msg) => {
          console.log(`[API] ${msg}`);
          addLog(msg);
        },
        signal,
      )
        .then((outPath) => {
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
      const files = await readdir(outputDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      const results = [];
      for (const file of jsonFiles) {
        try {
          const content = await readFile(join(outputDir, file), 'utf-8');
          const data = JSON.parse(content);
          results.push({
            filename: file,
            meta: data.meta || {},
            count: data.jobs?.length || 0,
            aiAgentSummary: data.meta?.aiAgentSummary || {
              detectedCount: 0,
              highCount: 0,
              mediumCount: 0,
              lowCount: 0,
            },
          });
        } catch {
          // Ignore malformed JSON files
        }
      }

      results.sort((a, b) => b.meta.scrapedAt?.localeCompare(a.meta.scrapedAt || '') || 0);

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
      const files = await readdir(outputDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      if (jsonFiles.length === 0) {
        return new Response('No results to export', {
          status: 404,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }

      const archive = archiver('zip', { zlib: { level: 9 } });
      const passThrough = new PassThrough();

      archive.on('error', (err) => {
        console.error('Zip export failed', err);
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
      const { unlink } = await import('node:fs/promises');
      await unlink(join(outputDir, filename));
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete';
      const status = message.includes('no such file') ? 404 : 500;
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
      const content = await readFile(join(outputDir, filename), 'utf-8');
      return new Response(content, {
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

createServer((req, res) => {
  void respond(req, res);
}).listen(3000, () => {
  console.log('API Server running at http://localhost:3000');
});

async function respond(req: IncomingMessage, res: ServerResponse) {
  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  try {
    const request = nodeRequestToFetchRequest(req, abortController.signal);
    const response = await handleRequest(request);
    await writeFetchResponse(res, response);
  } catch (err) {
    if (abortController.signal.aborted) {
      return;
    }

    console.error('Request failed', err);
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

async function ensureDir(path: string) {
  try {
    await readdir(path);
  } catch {
    const fs = await import('node:fs/promises');
    await fs.mkdir(path, { recursive: true });
  }
}
