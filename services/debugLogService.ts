const STORAGE_KEY = 'debug_prompt_logs';
const MAX_LOG_ENTRIES = 20;
let originalFetch: typeof window.fetch | null = null;
let fetchLoggingEnabled = false;

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  scope: string;
  event: string;
  data: unknown;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function readLogs(): DebugLogEntry[] {
  if (!canUseStorage()) return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLogs(entries: DebugLogEntry[]) {
  if (!canUseStorage()) return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore logging failures so gameplay is never blocked.
  }
}

export function appendDebugLog(input: Omit<DebugLogEntry, 'id' | 'timestamp'>) {
  const entries = readLogs();
  entries.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    ...input,
  });
  writeLogs(entries.slice(-MAX_LOG_ENTRIES));
}

export function getDebugLogs(): DebugLogEntry[] {
  return readLogs();
}

export function getDebugLogCount(): number {
  return readLogs().length;
}

export function clearDebugLogs() {
  if (!canUseStorage()) return;
  localStorage.removeItem(STORAGE_KEY);
}

export function downloadDebugLogs() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const logs = getDebugLogs();
  const blob = new Blob([JSON.stringify(logs, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sillycard-debug-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function parseMaybeJson(text: string): unknown {
  if (!text) return text;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getRequestBody(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  if (typeof init?.body === 'string') {
    return parseMaybeJson(init.body);
  }

  if (typeof Request !== 'undefined' && input instanceof Request) {
    try {
      const bodyText = await input.clone().text();
      return parseMaybeJson(bodyText);
    } catch {
      return null;
    }
  }

  return null;
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input);
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function shouldLogFetch(url: string, method: string): boolean {
  if (url.includes('/chat/completions')) return true;
  if (method !== 'GET' && method !== 'HEAD') return true;
  return false;
}

function ensureFetchPatched() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function' || originalFetch) {
    return;
  }

  originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const currentFetch = originalFetch!;

    if (!fetchLoggingEnabled) {
      return currentFetch(input, init);
    }

    const url = getRequestUrl(input);
    const method = getRequestMethod(input, init);
    const logThisRequest = shouldLogFetch(url, method);
    const requestBody = logThisRequest ? await getRequestBody(input, init) : null;
    const response = await currentFetch(input, init);

    if (logThisRequest) {
      let responseBody: unknown = null;

      try {
        const responseText = await response.clone().text();
        responseBody = parseMaybeJson(responseText);
      } catch {
        responseBody = null;
      }

      appendDebugLog({
        scope: 'fetch',
        event: 'http-exchange',
        data: {
          url,
          method,
          requestBody,
          status: response.status,
          ok: response.ok,
          responseBody,
        },
      });
    }

    return response;
  };
}

export function setNetworkDebugLoggingEnabled(enabled: boolean) {
  fetchLoggingEnabled = enabled;
  ensureFetchPatched();
}
