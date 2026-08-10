interface CacheEntry {
  data: any;
  ttl: number;
}

const cache = new Map<string, CacheEntry>();

const PY_URL = process.env.ANALYSIS_PY_URL || 'http://localhost:5100';
const RS_URL = process.env.ANALYSIS_RS_URL || 'http://localhost:5200';
const TIMEOUT_MS = Number(process.env.ANALYSIS_TIMEOUT_MS || 5000);

function ttlFor(key: string): number {
  if (key.startsWith('py:text')) return 5 * 60 * 1000;
  if (key.startsWith('py:stats')) return 10 * 60 * 1000;
  if (key.startsWith('py:trends')) return 10 * 60 * 1000;
  if (key.startsWith('rs:')) return 60 * 1000;
  return 5 * 60 * 1000;
}

export function analysisCacheGet(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function analysisCacheSet(key: string, data: any): void {
  const ttl = Date.now() + ttlFor(key);
  cache.set(key, { data, ttl });
}

export function analysisCacheInvalidate(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

async function post(url: string, payload: unknown, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call the Python analysis microservice. Returns null when unavailable or failing.
 */
export async function callPython(endpoint: string, payload: unknown): Promise<any> {
  const cacheKey = `py:${endpoint}:${JSON.stringify(payload)}`;
  const cached = analysisCacheGet(cacheKey);
  if (cached !== null) return cached;
  const result = await post(`${PY_URL}${endpoint}`, payload, TIMEOUT_MS);
  if (result === null) return null;
  analysisCacheSet(cacheKey, result);
  return result;
}

/**
 * Call the Rust analysis microservice. Returns null when unavailable or failing.
 */
export async function callRust(endpoint: string, payload: unknown): Promise<any> {
  const cacheKey = `rs:${endpoint}:${JSON.stringify(payload)}`;
  const cached = analysisCacheGet(cacheKey);
  if (cached !== null) return cached;
  const result = await post(`${RS_URL}${endpoint}`, payload, TIMEOUT_MS);
  if (result === null) return null;
  analysisCacheSet(cacheKey, result);
  return result;
}

/** Health probe for the advanced-analytics banner (no caching). */
export async function microservicesHealth(): Promise<{ py: boolean; rs: boolean }> {
  const probe = async (url: string) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  };
  const [py, rs] = await Promise.all([probe(`${PY_URL}/health`), probe(`${RS_URL}/health`)]);
  return { py, rs };
}
