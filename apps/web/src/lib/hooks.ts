import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api';

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** GET helper returning { data, meta } with caching keyed by path + params. */
export function useApi<T = any>(path: string, query?: Record<string, unknown>, opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery({ queryKey: [path, query ?? {}], queryFn: () => api<T>(path, { query }), placeholderData: keepPreviousData, ...opts });
}
