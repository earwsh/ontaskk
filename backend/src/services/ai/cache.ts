import { AICacheEntry } from './types';

const store = new Map<string, AICacheEntry>();

const TTL: Record<string, number> = {
  health: 10 * 60 * 1000,
  predict: 15 * 60 * 1000,
  prioritize: 5 * 60 * 1000,
  workload: 10 * 60 * 1000,
  daily: 5 * 60 * 1000,
  weekly: 30 * 60 * 1000,
  generate: 2 * 60 * 1000,
  search: 1 * 60 * 1000,
  meeting: 5 * 60 * 1000,
  executive: 20 * 60 * 1000,
  dashboard: 5 * 60 * 1000,
  summary: 5 * 60 * 1000,
  recommendations: 10 * 60 * 1000,
};

function getTTL(key: string): number {
  for (const [prefix, ttl] of Object.entries(TTL)) {
    if (key.startsWith(prefix)) return ttl;
  }
  return 5 * 60 * 1000;
}

export function cacheGet(key: string): any | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.ttl) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function cacheSet(key: string, data: any): void {
  const ttl = Date.now() + getTTL(key);
  store.set(key, { data, ttl });
}

export function cacheInvalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
