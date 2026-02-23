import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serve } from 'bun';
import { runScraper } from './scraper.ts';
import type { SearchOptions } from './types.ts';

let currentLogs: string[] = [];
let isScraping = false;
let scrapeAbortController: AbortController | null = null;
const sseControllers: Set<(data: string) => void> = new Set();

const addLog = (msg: string) => {
  currentLogs.push(msg);
  const sseMsg = `data: ${JSON.stringify({ type: 'log', message: msg })}\n\n`;
  for (const controller of sseControllers) {
    try {
      controller(sseMsg);
    } catch (_e) {
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
    } catch (_e) {
      // ignore broken pipes
    }
  }
};

serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname === '/api/logs' && req.method === 'GET') {
      const stream = new ReadableStream({
        start(controller) {
          const send = (data: string) =>
            controller.enqueue(new TextEncoder().encode(data));

          sseControllers.add(send);

          send(`data: ${JSON.stringify({ type: 'status', isScraping })}\n\n`);
          for (const log of currentLogs) {
            send(`data: ${JSON.stringify({ type: 'log', message: log })}\n\n`);
          }

          req.signal.addEventListener('abort', () => {
            sseControllers.delete(send);
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
        return new Response(
          JSON.stringify({ error: 'Scraping already in progress' }),
          { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } },
        );
      }

      try {
        const body = (await req.json()) as Record<string, unknown>;
        const options: SearchOptions = {
          keywords: typeof body.keywords === 'string' ? body.keywords : '',
          location: typeof body.location === 'string' ? body.location : '',
          limit:
            typeof body.limit === 'number'
              ? body.limit
              : Number(body.limit) || 50,
          outDir: './out',
          headless: typeof body.headless === 'boolean' ? body.headless : true,
          debug: typeof body.debug === 'boolean' ? body.debug : false,
          remoteOnly:
            typeof body.remoteOnly === 'boolean' ? body.remoteOnly : false,
          experienceLevel:
            typeof body.experienceLevel === 'string' && body.experienceLevel
              ? body.experienceLevel.split(',').map((s) => s.trim())
              : undefined,
          jobType:
            typeof body.jobType === 'string' && body.jobType
              ? body.jobType.split(',').map((s) => s.trim())
              : undefined,
          postedWithin:
            typeof body.postedWithin === 'string'
              ? body.postedWithin || undefined
              : undefined,
        };

        if (!options.keywords) {
          return new Response(
            JSON.stringify({ error: 'Keywords are required' }),
            {
              status: 400,
              headers: { 'Access-Control-Allow-Origin': '*' },
            },
          );
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
            const msg = signal.aborted
              ? '\n--- SCRAPE ABORTED ---'
              : '\n--- SCRAPE FAILED ---';
            addLog(msg);
            notifyStatus(false);
            scrapeAbortController = null;
          });

        return new Response(
          JSON.stringify({ success: true, message: 'Scraper started' }),
          { headers: { 'Access-Control-Allow-Origin': '*' } },
        );
      } catch (_err) {
        return new Response(JSON.stringify({ error: 'Invalid request body' }), {
          status: 400,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    if (url.pathname === '/api/abort' && req.method === 'POST') {
      if (!scrapeAbortController || !isScraping) {
        return new Response(
          JSON.stringify({ error: 'No active scrape to abort' }),
          { status: 409, headers: { 'Access-Control-Allow-Origin': '*' } },
        );
      }

      addLog('[SYSTEM] Abort requested.');
      scrapeAbortController.abort();
      return new Response(
        JSON.stringify({ success: true, message: 'Abort signaled' }),
        { headers: { 'Access-Control-Allow-Origin': '*' } },
      );
    }

    if (url.pathname === '/api/results' && req.method === 'GET') {
      try {
        await ensureDir('./out');
        const files = await readdir('./out');
        const jsonFiles = files.filter((f) => f.endsWith('.json'));

        const results = [];
        for (const file of jsonFiles) {
          try {
            const content = await readFile(join('./out', file), 'utf-8');
            const data = JSON.parse(content);
            results.push({
              filename: file,
              meta: data.meta || {},
              count: data.jobs?.length || 0,
            });
          } catch (_e) {
            // Ignore malformed JSON files
          }
        }

        results.sort(
          (a, b) =>
            b.meta.scrapedAt?.localeCompare(a.meta.scrapedAt || '') || 0,
        );

        return new Response(JSON.stringify({ results }), {
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      } catch (_err) {
        return new Response(JSON.stringify({ results: [] }), {
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
        const content = await readFile(join('./out', filename), 'utf-8');
        return new Response(content, {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (_e) {
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
  },
});

async function ensureDir(path: string) {
  try {
    await readdir(path);
  } catch (_e) {
    import('node:fs/promises').then((fs) =>
      fs.mkdir(path, { recursive: true }),
    );
  }
}

console.log('Bun API Server running at http://localhost:3000');
