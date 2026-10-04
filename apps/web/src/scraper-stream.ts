import { useSyncExternalStore } from 'react';

const LOGS_URL = '/api/logs';

/** Kept short enough that a reconnect burst arrives as a few renders, not hundreds. */
const FLUSH_MS = 100;

/**
 * How much console history the page holds. A long session streams tens of
 * thousands of lines, and the ones far above the fold are not worth a DOM node.
 */
const MAX_LINES = 2000;

const RECONNECT_MS = 3000;

export interface LogLine {
  /** Stable across renders, unlike an array index or the text itself. */
  id: number;
  text: string;
  /** Taken when the line arrived, so it does not drift on every re-render. */
  at: string;
}

interface StreamState {
  logs: LogLine[];
  isScraping: boolean;
}

/**
 * One EventSource for the whole page, shared by every subscriber. The server
 * sends logs and status down the same stream, so a second connection would
 * double the traffic to show the same thing twice.
 */
let state: StreamState = { logs: [], isScraping: false };
const listeners = new Set<() => void>();

let source: EventSource | null = null;
let subscribers = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

let pending: LogLine[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let nextId = 0;

function emit(next: StreamState): void {
  state = next;
  for (const listener of listeners) listener();
}

function flush(): void {
  flushTimer = undefined;
  if (pending.length === 0) return;
  const logs = [...state.logs, ...pending].slice(-MAX_LINES);
  pending = [];
  emit({ ...state, logs });
}

/** Batched: a scrape emits lines faster than a render is worth doing. */
export function appendLog(text: string): void {
  pending.push({ id: nextId++, text, at: new Date().toLocaleTimeString() });
  flushTimer ??= setTimeout(flush, FLUSH_MS);
}

export function clearLogs(): void {
  pending = [];
  emit({ ...state, logs: [] });
}

function connect(): void {
  source?.close();
  // The server replays its whole log on every connection, so the incoming
  // stream is the history. Keeping what is on screen would double it.
  clearLogs();
  source = new EventSource(LOGS_URL);

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as {
        type?: string;
        message?: string;
        isScraping?: boolean;
      };
      if (data.type === 'log' && typeof data.message === 'string') {
        appendLog(data.message);
      } else if (data.type === 'status') {
        emit({ ...state, isScraping: data.isScraping === true });
      }
    } catch (err) {
      console.error('Error parsing SSE data', err);
    }
  };

  source.onerror = () => {
    source?.close();
    source = null;
    reconnectTimer = setTimeout(connect, RECONNECT_MS);
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (++subscribers === 1) connect();

  return () => {
    listeners.delete(listener);
    if (--subscribers > 0) return;
    clearTimeout(reconnectTimer);
    clearTimeout(flushTimer);
    flushTimer = undefined;
    source?.close();
    source = null;
  };
}

function snapshot(): StreamState {
  return state;
}

/** The live log and scrape status. Every caller shares one connection. */
export function useScraperStream(): StreamState {
  return useSyncExternalStore(subscribe, snapshot);
}
